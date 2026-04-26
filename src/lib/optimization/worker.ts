/// <reference lib="webworker" />
import { WebIO, Document } from '@gltf-transform/core';
import { simplify, dedup, prune, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import type {
  OptimizeRequest,
  WorkerMessage,
} from './types';
import {
  geometryRatio,
  textureMultiplier,
  materialFlags,
} from './sliderMapping';

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent<OptimizeRequest>) => {
  const { glbBuffer, sliders } = e.data;
  try {
    await MeshoptSimplifier.ready;

    const io = new WebIO();
    const doc = await io.readBinary(new Uint8Array(glbBuffer));

    const root = doc.getRoot();
    const isRigged = root.listSkins().length > 0;

    const ratio = geometryRatio(sliders.geometryDensity, isRigged);
    const texMult = textureMultiplier(sliders.textureQuality);
    const flags = materialFlags(sliders.vertexPrecision);

    post({ type: 'progress', stage: 'analyzing input', percent: 5 });

    if (flags.weld) {
      post({ type: 'progress', stage: 'welding vertices', percent: 15 });
      await doc.transform(weld());
    }

    if (ratio < 0.99) {
      post({
        type: 'progress',
        stage: `simplifying geometry (${Math.round(ratio * 100)}% retained)`,
        percent: 30,
      });
      await doc.transform(
        simplify({
          simplifier: MeshoptSimplifier,
          ratio,
          error: 0.001,
          lockBorder: isRigged,
        })
      );
    }

    post({ type: 'progress', stage: 'merging duplicate materials', percent: 60 });
    await doc.transform(dedup(), prune());

    if (texMult < 0.99) {
      post({
        type: 'progress',
        stage: `resizing textures to ${Math.round(texMult * 100)}%`,
        percent: 75,
      });
      await resizeAllTextures(doc, texMult);
    }

    post({ type: 'progress', stage: 'writing GLB', percent: 95 });
    const out = await io.writeBinary(doc);

    const inputBytes = glbBuffer.byteLength;
    const outputBytes = out.byteLength;

    const outBuf = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
    post(
      {
        type: 'done',
        glbBytes: outBuf,
        inputBytes,
        outputBytes,
        appliedRatio: ratio,
        textureMultiplier: texMult,
        riggedCappedReduction: isRigged && sliders.geometryDensity < 0.66,
      },
      [outBuf]
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    post({ type: 'error', message });
  }
};

function post(msg: WorkerMessage, transfer: Transferable[] = []) {
  ctx.postMessage(msg, transfer);
}

async function resizeAllTextures(doc: Document, multiplier: number): Promise<void> {
  const textures = doc.getRoot().listTextures();
  for (const tex of textures) {
    const image = tex.getImage();
    const mime = tex.getMimeType();
    if (!image || !mime) continue;
    if (mime !== 'image/png' && mime !== 'image/jpeg') continue;

    try {
      const blob = new Blob([image as BlobPart], { type: mime });
      const bitmap = await createImageBitmap(blob);

      const newW = Math.max(64, Math.round(bitmap.width * multiplier));
      const newH = Math.max(64, Math.round(bitmap.height * multiplier));

      // Skip if not actually shrinking meaningfully
      if (newW >= bitmap.width && newH >= bitmap.height) {
        bitmap.close();
        continue;
      }

      const canvas = new OffscreenCanvas(newW, newH);
      const c2d = canvas.getContext('2d');
      if (!c2d) {
        bitmap.close();
        continue;
      }
      c2d.drawImage(bitmap, 0, 0, newW, newH);
      bitmap.close();

      // Re-encode (jpeg for color, png to preserve alpha if originally png)
      const outBlob = await canvas.convertToBlob({
        type: mime,
        quality: mime === 'image/jpeg' ? 0.85 : undefined,
      });
      const outArr = new Uint8Array(await outBlob.arrayBuffer());
      tex.setImage(outArr);
    } catch (err) {
      // Non-fatal — skip this texture and continue
      console.warn('texture resize failed', err);
    }
  }
}
