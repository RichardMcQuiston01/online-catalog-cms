/** A media image associated with a product. */
export interface Image {
  id: string;
  productId: string;
  url: string;
  altText: string;
  sortOrder: number;
  createdAt: Date;
}

/** Input for associating a new image with a product. */
export interface CreateImageInput {
  productId: string;
  url: string;
  altText: string;
  sortOrder?: number;
}
