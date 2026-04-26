# AI Adaptive 3D Scene Optimizer

## Built with
* **Frontend UI:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
* **3D Engine:** Three.js, React Three Fiber
* **Optimization Core:** glTF-Transform, Meshoptimizer (running locally in-browser via WebAssembly)
* **AI & Security:** Groq API (Llama 3.3 70B), Vercel Edge Functions (API proxying and key protection), Zustand

## What problem does your project solve and how does it improve accessibility in creative tech?
**Tackling Track 1 (3D/CGI):** The 3D pipeline is notoriously intimidating for new users. High-quality 3D scenes are usually massive and completely unoptimized for platforms like web or mobile. Traditionally, getting these assets "game-ready" requires a technical artist to navigate complex, overwhelming software like Maya or Blender. 

**Our Solution for Beginners:** We built a tool that completely removes that friction. You just load a scene, and our engine analyzes its performance bottlenecks. With a few simple sliders, anyone—even absolute beginners—can instantly optimize the model and see a live before/after wireframe comparison. It democratizes 3D creation by letting indie devs, web designers, and hobbyists get their assets platform-ready without having to learn a massive 3D software suite first.

**Cybersecurity & IP Protection:** We paired this beginner-friendly design with enterprise-grade security. Because the mesh decimation runs 100% client-side in your browser via WebAssembly, **your 3D models are never uploaded to a cloud server**. The only data sent out is a secure, lightweight metadata summary routed through a Vercel Edge Function proxy. This guarantees zero risk of intellectual property theft or data leaks, making it entirely safe for both hobbyists and corporate studios to optimize unreleased, proprietary assets.

## If AI is implemented into the project, please explain its thoughtful implementation of human-AI over automation that replaces the creative process?
We use AI strictly as a "technical director" and tutor, not a replacement for the artist. Our AI (Llama 3.3 via Groq) looks at the hard data of your scene—like triangle counts, draw calls, and texture sizes—and explains exactly what's slowing down your performance in plain, beginner-friendly English. 

For newcomers to 3D, this is a game-changer. Instead of just compressing the file like a black box, the AI teaches them *why* a model is heavy, radically accelerating their learning curve in the 3D pipeline. It recommends the best optimization preset, but **the human stays in the driver's seat**. You get the final say on the sliders, letting you decide the perfect balance between visual quality and file size. We designed the AI to handle the tedious technical cleanup and educate the user, ensuring creators can focus entirely on their artistic vision.
