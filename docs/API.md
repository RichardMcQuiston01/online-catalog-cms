# API Reference

Call `await catalog.initialize()` before any other method and `await catalog.close()` to release database resources when finished.

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

// Read (resolves to null if not found)
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
  limit: 20, // optional
  offset: 0, // optional
});
```

## Categories

```ts
const category = await catalog.categories.create({
  name: "Electronics",
  slug: "electronics", // optional, auto-generated if omitted
  parentId: null, // optional, for nested categories
});

// Read (resolves to null if not found)
const found = await catalog.categories.get(category.id);

const renamed = await catalog.categories.update(category.id, { name: "Gadgets" });

await catalog.categories.delete(category.id);

// List with filters
const children = await catalog.categories.list({
  parentId: category.id,
  search: "phone", // optional
  limit: 20, // optional
  offset: 0, // optional
});
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
  file: buffer, // Buffer or Readable stream
  filename: "photo.jpg",
  altText: "Product photo",
  contentType: "image/jpeg", // optional
  sortOrder: 0, // optional
});

// Read one image (resolves to null if not found)
const found = await catalog.images.get(image.id);

// List images for a product
const images = await catalog.images.listByProduct(product.id);

// Delete (also removes from storage)
await catalog.images.delete(image.id);
```
