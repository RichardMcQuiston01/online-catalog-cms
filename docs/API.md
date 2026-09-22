# API Reference

## Products

```ts
// Create
const product = await catalog.products.create({
  name: "Widget",
  price: 999, // cents
  sku: "WGT-001", // optional
  categoryId: "uuid", // optional
  description: richTextDoc, // RichTextDocument
  metadata: {}, // arbitrary JSON
});

// Read
const product = await catalog.products.get("uuid");

// Update
const updated = await catalog.products.update("uuid", { price: 1299 });

// Delete (also deletes associated images from storage)
await catalog.products.delete("uuid");

// List with filters
const products = await catalog.products.list({
  categoryId: "uuid",
  search: "widget", // searches name and SKU
  minPrice: 500,
  maxPrice: 2000,
});
```

## Categories

```ts
const category = await catalog.categories.create({
  name: "Electronics",
  slug: "electronics", // optional, auto-generated if omitted
  parentId: null, // optional, for nested categories
});

const children = await catalog.categories.list({ parentId: category.id });
```

## Images

```ts
// Associate an external URL
const image = await catalog.images.addUrl({
  productId: product.id,
  url: "https://cdn.example.com/img.jpg",
  altText: "Product photo",
  sortOrder: 0, // optional
});

// Upload via storage adapter
const image = await catalog.images.upload({
  productId: product.id,
  file: buffer,
  filename: "photo.jpg",
  altText: "Product photo",
  contentType: "image/jpeg",
});

// List images for a product
const images = await catalog.images.listByProduct(product.id);

// Delete (also removes from storage)
await catalog.images.delete(image.id);
```
