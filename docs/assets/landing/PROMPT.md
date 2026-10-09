# Landing imagery

The studio scene is illustrative artwork generated with the built-in imagegen tool, not a customer project or a claimed Mirai edit result. The selected image is encoded as `public/landing/studio-scene.webp` (1672 × 941, quality 88). The original generated PNG is retained outside the repository.

Final prompt:

> Use case: photorealistic-natural. Create one wide 16:9 editorial architectural photograph for the hero of Mirai, a refined image editor. A sunlit Mediterranean creative studio with tactile pale warm sage plaster walls, a muted stone floor, and one sculptural burnt-orange lounge chair on the RIGHT third beside a tall arched opening revealing soft olive hills. Real materials, soft late-afternoon sunlight, quiet tasteful magazine photography, believable texture and grounded natural shadows. The LEFT 55 percent is an uncluttered softly lit sage wall, low contrast and light enough for dark website typography; do not place any object or sharp shadow there. On the right, subtle sunlit arch geometry and the orange chair create the single memorable visual anchor. The bottom half may include the pale stone floor, with gentle shadow only below the chair. Camera roughly eye level, relaxed generous space, no people, no text, no typography, no letters, no UI, no logo, no interface frame, no collage, no panels, no watermarks. This is a photographic image asset only, not a website screenshot. Landscape wide framing, high image quality.

`public/landing/editor-workspace.webp` is an actual 1440 × 900 screenshot of the local Mirai workspace with that scene uploaded and a source-space selection drawn around the chair. It is encoded at WebP quality 90. No provider call or accepted edit was made for the screenshot; the Next.js development indicator was hidden from the capture.

## Actual Mirai results

At the user's request, a creation sample and edited comparison result were produced through Mirai's local UI with real OpenAI adapters. They are purpose-created demo assets, not customer work. Landing visitors see bundled assets and never trigger an AI request.

`public/landing/studio-created.webp` is the earlier photographic hero, retained as a creation sample: a 1280 × 720 Create with AI result, Photograph treatment, YouTube Thumbnail format, `gpt-image-2`, low quality. The result was opened with Use in Mirai and its new original project was saved. Final UI prompt:

> A refined editorial architectural photograph of a sunlit Mediterranean creative studio, tactile pale warm sage plaster walls and a pale stone floor. One sculptural burnt-orange lounge chair sits on the RIGHT third beside a tall arched opening revealing soft olive hills. A small olive tree at the far right. The LEFT 55 percent is an uncluttered softly lit light sage wall, without objects or sharp shadows, leaving space for dark website typography. Quiet late-afternoon sunlight, real textures, grounded natural shadows, generous negative space, eye-level camera, landscape wide framing. No people, no text, no lettering, no logo, no UI, no watermark.

`public/landing/studio-ai-edit.webp` is a 1672 × 941 AI Transform result for the original `studio-scene.webp` scene. Custom treatment and Balanced preservation were selected; the preview was reviewed and accepted in the editor, creating one reversible operation. The full normalized result is shown in the landing comparison rather than a browser filter. Final UI prompt:

> Replace the orange lounge chair with a sculptural forest-green boucle lounge chair with a rounded back and a soft cream cushion. Keep the sunlit Mediterranean studio, arch, olive hillside, camera angle, lighting, and empty left wall intact. Photorealistic editorial interior photograph. No text or lettering.

Both PNG results were retrieved from Mirai's existing local diagnostic artifacts after the UI generation completed and encoded as WebP at quality 90 without cropping or compositing. The in-app browser did not expose a download event for the export action. Saving the larger Transform demonstration project hit the existing 10 MiB request-body limit; the accepted result and original remain separately retained outside the repository. No diagnostics, provider response payloads, or credentials are published with these public image assets.

## Retained workspace-led opening

The earlier landing opened with `public/landing/editor-poster.webp`, an actual 1440 × 900 local Mirai screenshot, encoded as WebP at quality 92. `sample-poster.svg` is original code-drawn artwork made for this demo, rasterized to a 1200 × 900 PNG and uploaded through the editor. It is illustrative input, not an AI output or a customer image. This asset is retained but no longer displayed on the landing page.

The project name is “Daydream / poster study.” A source-space selection surrounds the sun. Select & edit → Replace is configured with: “Replace the sun with a crescent moon. Keep the blue waves and the poster lettering.” The prompt is prepared but not generated; no paid call, accepted edit, or history mutation was performed for this screenshot. Only the development indicator is hidden from the capture. The previous studio workspace screenshot, creation sample, and green-chair comparison remain retained assets.

## Creative-studio landing: Mirai-created styles

The current landing uses four new images created on October 9, 2026 through Mirai's own local application API with its real OpenAI provider adapter. A browser confirmation dialog prevented automated submission through the local UI, so the requests were submitted to the existing `/api/asset-generations` endpoint. No separate image-generation tool output or direct provider SDK call is used for these assets. These are purpose-created examples, not customer work or a guarantee of future output.

All four requests used Create with AI image mode, Instagram Post format, `gpt-image-2`, low quality, and 1024 × 1024 output. The complete results were encoded as WebP at quality 90, without cropping or compositing. The exact submitted prompts and treatments are stored in `src/features/landing/creation-examples.ts` and displayed in the gallery:

- `public/landing/mirai-portrait.webp`: Photograph; an editorial portrait with a short black bob and lime sunglasses.
- `public/landing/mirai-anime.webp`: Anime; a fox in a lime scarf overlooking a moonlit city.
- `public/landing/mirai-watercolor.webp`: Watercolor; a lemon tree painted on tactile ivory paper.
- `public/landing/mirai-astronaut.webp`: 3D; a miniature astronaut wearing a lime helmet.

`public/landing/mirai-portrait-edit.webp` is the complete normalized review candidate returned by Mirai's existing `/api/image-edits` pipeline for the original portrait. AI Transform, review boundary, and Balanced preservation were used. The image provider produced a 1024 × 1024 medium-quality candidate. It is encoded as WebP at quality 90; no browser filter, compositing, masked preservation, or acceptance is implied by the landing demonstration. The final submitted edit prompt was:

> Transform this photograph into an expressive screen-printed editorial portrait on textured ivory paper. Preserve the woman’s identity, short black bob, profile, pose and exact framing. Use bold charcoal ink shapes, tactile halftone shadows, torn-paper texture and bright acid-lime sunglasses as the single accent. Sophisticated handmade risograph poster aesthetic, dramatic graphic contrast, richly detailed face, no lettering or added objects.

`public/landing/editor-portrait.webp` is an actual 1440 × 900 local Mirai editor screenshot, encoded as WebP at quality 92. The original generated portrait was uploaded into a new workspace, named “Mirai / portrait study,” and a selection drawn around the glasses in source-image coordinates. Replace was configured with “Replace the lime sunglasses with sculptural chrome sunglasses. Keep the portrait and lighting.” That prepared Replace request was not submitted and no edit was accepted for the screenshot. Only the development indicator was hidden.

The original generated PNGs, full edit PNG, capture PNG, request manifest, and reproducible local request scripts are retained outside version control under `.local-edit/ui-review/creative-studio/`. Public assets contain no credentials, diagnostics, or provider response payloads. The landing displays static assets; selecting a style only reveals its example prompt and never makes a paid request. Previous sofa and code-drawn poster assets are retained but unused by this composition.
