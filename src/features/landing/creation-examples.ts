import type { ImageTreatment } from "@/shared/asset-generation";

export const creationExamples: Array<{
  id: string;
  treatment: ImageTreatment;
  label: string;
  title: string;
  src: string;
  alt: string;
  prompt: string;
}> = [
  {
    id: "portrait",
    treatment: "photograph",
    label: "Photograph",
    title: "A different kind of portrait.",
    src: "/landing/mirai-portrait.webp",
    alt: "AI-created editorial portrait with acid-lime sunglasses against a charcoal background",
    prompt: "A striking editorial close-up portrait of a young adult woman with short glossy black bob hair, translucent acid-lime wraparound sunglasses, subtle freckles and natural skin texture, wearing a charcoal high-neck jacket. Hard cinematic side light against a dark charcoal studio backdrop. Medium-format fashion photography, crisp detail, cool confidence, angular composition. Palette: charcoal, pale ivory highlights, electric yellow-green glasses. No words, logos, watermark or UI.",
  },
  {
    id: "anime",
    treatment: "anime",
    label: "Anime",
    title: "Build a world of your own.",
    src: "/landing/mirai-anime.webp",
    alt: "AI-created anime fox with a lime scarf overlooking a moonlit futuristic city",
    prompt: "A cream-colored fox explorer with expressive eyes and a bright acid-lime scarf standing on a rooftop at night, gazing over a futuristic Japanese city. Sweeping cinematic perspective, charcoal towers, tiny lime-lit windows, a huge pale moon and softly painted clouds. A richly detailed anime key visual with hand-painted background textures, bold silhouettes and a sense of adventure. No words, logos, watermark or UI.",
  },
  {
    id: "watercolor",
    treatment: "watercolor",
    label: "Watercolor",
    title: "Let the texture do the talking.",
    src: "/landing/mirai-watercolor.webp",
    alt: "AI-created watercolor lemon tree with yellow fruit and visible pigment on ivory paper",
    prompt: "An expressive watercolor painting of a lemon tree in a weathered terracotta pot in a sunlit Mediterranean courtyard. Heavy textured ivory paper, visible pigment blooms, loose lively brush marks, deep green leaves and brilliant yellow lemons. Sparse charcoal architectural lines, warm clay touches, luminous airy composition, beautiful art-book quality. Tactile watercolor pigment on real paper. No words, logos, watermark or UI.",
  },
  {
    id: "astronaut",
    treatment: "three-dimensional",
    label: "3D",
    title: "Give an idea a new dimension.",
    src: "/landing/mirai-astronaut.webp",
    alt: "AI-created ivory astronaut character with a lime helmet floating against a dark background",
    prompt: "A delightful small astronaut floating weightlessly in a puffy ivory spacesuit with an oversized acid-lime helmet frame and glossy black mirror visor reflecting one tiny star. Chunky premium vinyl-toy proportions, tactile stitching, physically based 3D character render, deep charcoal backdrop and hard studio rim lighting. Full character in a three-quarter view with generous breathing room. Strong friendly silhouette, white and electric yellow-green against near-black. No words, logos, watermark or UI.",
  },
];
