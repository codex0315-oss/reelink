// Everything the video template needs, whether it came from a saved listing or from
// details typed into the AI quick-create flow. Shared by both renderers.
export type ReelSource = {
  title: string;
  price: number;
  status: string;
  listingType: string;
  amenities: string[];
  photoUrls: string[];
};
