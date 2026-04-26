import { useSceneStore, ASSET_OPTIONS } from '@/store/sceneStore';
import { GLBSubmodel } from './GLBSubmodel';

type Props = {
  wireframe?: boolean;
};

export function SceneModel({ wireframe = false }: Props) {
  const currentAsset = useSceneStore((s) => s.currentAsset);
  const uploadedAssetUrl = useSceneStore((s) => s.uploadedAssetUrl);

  if (currentAsset === 'uploaded' && uploadedAssetUrl) {
    return <GLBSubmodel url={uploadedAssetUrl} wireframe={wireframe} />;
  }

  const option = ASSET_OPTIONS.find((o) => o.id === currentAsset);
  if (!option) return null;
  return <GLBSubmodel url={option.url} wireframe={wireframe} />;
}
