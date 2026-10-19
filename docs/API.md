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
const bySlug = await catalog.categories.getBySlug("electronics");

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

## Validation

The services check input before anything is written, so every database adapter accepts and rejects the same things. Failures throw a `ValidationError` (exported from the package) whose `field` names the input property; a slug that is already used throws `SlugConflictError`, a subclass.

| Input | Rule |
| --- | --- |
| `name` | Required, not blank, at most 255 characters. |
| `price` | A non-negative integer in the smallest currency unit (cents). `NaN`, `Infinity`, floats and negatives are rejected. |
| `sku` | `null` or a string of at most 255 characters. |
| `slug` | Optional. Letters and digits of any script, joined by single `-` or `_`, at most 255 characters. Omitted slugs are generated from the name with diacritics removed (`Café Latte` becomes `cafe-latte`, `日本語` stays `日本語`) and get `-2`, `-3`, ... if taken. An explicit slug that is taken throws `SlugConflictError`. A name with no letters or digits needs an explicit slug. |
| `description` | A valid rich-text document (see the rich-text section of the README). |
| `metadata` | A plain JSON object of at most 65,536 serialized characters, nested at most 10 levels. Keys may not start with `$` or contain `.` (MongoDB cannot store them). It is stored as JSON, so a `Date` comes back as an ISO string on every adapter. |
| `categoryId` | `null` or the id of an existing category. |
| `parentId` | `null` or the id of an existing category that is not the category itself or one of its descendants. |
| image `productId` | The id of an existing product. |
| image `altText` | At most 500 characters. |
| image `url` (`addUrl`) | An `http(s)` URL or a root-relative path, at most 2048 characters. |
| `list()` filters | `limit` is an integer from 0 to 1000 (default 100; `0` is an empty page), `offset` a non-negative integer, `minPrice`/`maxPrice` finite numbers, `categoryId`/`parentId` a string or `null`, `search` at most 200 characters (`%` and `_` match themselves). |

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
  sortOrder: 0, // optional
});

// Uploads accept JPEG, PNG, GIF, WebP and AVIF only. The format is detected
// from the file's content: the filename extension and any declared content
// type are ignored, and the stored name and content type follow the detected
// format. SVG, HTML and other files are rejected with a `ValidationError`, as
// are files over `maxUploadBytes` (default 10 MiB, set it on `OnlineCatalog`).

// Read one image (resolves to null if not found)
const found = await catalog.images.get(image.id);

// List images for a product
const images = await catalog.images.listByProduct(product.id);

// Delete (also removes from storage)
await catalog.images.delete(image.id);
```
