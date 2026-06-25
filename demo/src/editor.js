/**
 * Product create/edit page logic for demo/editor.html
 */
import { getCatalog } from './catalog-init.js';
import { htmlToRichText, richTextToEditableHtml } from './rich-text-util.js';
import { showToast } from './toast.js';

const form = document.getElementById('product-form');
const formTitle = document.getElementById('form-title');
const productIdInput = document.getElementById('product-id');
const nameInput = document.getElementById('name-input');
const nameError = document.getElementById('name-error');
const skuInput = document.getElementById('sku-input');
const priceInput = document.getElementById('price-input');
const priceError = document.getElementById('price-error');
const categorySelect = document.getElementById('category-select');
const descEditor = document.getElementById('description-editor');
const toolbar = document.getElementById('editor-toolbar');
const imageUrlInput = document.getElementById('image-url-input');
const imageAltInput = document.getElementById('image-alt-input');
const submitBtn = document.getElementById('submit-btn');

let editingId = null;
let originalImages = [];

async function init() {
  const adapter = await getCatalog();
  await populateCategories(adapter);
  await checkEditMode(adapter);
  setupToolbar();
  setupFormValidation();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    await handleSubmit(adapter);
  });
}

async function populateCategories(adapter) {
  const categories = await adapter.categories.list();
  for (const cat of categories) {
    const option = document.createElement('option');
    option.value = cat.id;
    option.textContent = cat.name;
    categorySelect.appendChild(option);
  }
}

async function checkEditMode(adapter) {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  if (!id) return;

  try {
    const product = await adapter.products.get(id);
    if (!product) {
      showToast('Product not found.', 'error');
      return;
    }

    editingId = id;
    originalImages = product.images;
    formTitle.textContent = 'Edit Product';
    document.title = `Edit ${product.name} — online-catalog-cms demo`;
    submitBtn.textContent = 'Update product';

    productIdInput.value = product.id;
    nameInput.value = product.name;
    skuInput.value = product.sku ?? '';
    priceInput.value = String(product.price);
    categorySelect.value = product.categoryId ?? '';

    if (product.description?.nodes?.length) {
      descEditor.innerHTML = richTextToEditableHtml(product.description);
    }

    if (product.images[0]) {
      imageUrlInput.value = product.images[0].url;
      imageAltInput.value = product.images[0].altText;
    }
  } catch (err) {
    showToast(`Failed to load product: ${err.message}`, 'error');
  }
}

function setupToolbar() {
  toolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cmd]');
    if (!btn) return;
    const cmd = btn.dataset.cmd;
    document.execCommand(cmd, false, undefined);
    descEditor.focus();
    updateToolbarState();
  });

  descEditor.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      document.execCommand('bold', false, undefined);
      updateToolbarState();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
      e.preventDefault();
      document.execCommand('italic', false, undefined);
      updateToolbarState();
    }
  });

  descEditor.addEventListener('keyup', updateToolbarState);
  descEditor.addEventListener('mouseup', updateToolbarState);
}

function updateToolbarState() {
  const boldBtn = toolbar.querySelector('[data-cmd="bold"]');
  const italicBtn = toolbar.querySelector('[data-cmd="italic"]');
  if (boldBtn) boldBtn.setAttribute('aria-pressed', String(document.queryCommandState('bold')));
  if (italicBtn) italicBtn.setAttribute('aria-pressed', String(document.queryCommandState('italic')));
}

function setupFormValidation() {
  nameInput.addEventListener('blur', () => validateField(nameInput, nameError, 'Product name is required.'));
  priceInput.addEventListener('blur', () =>
    validateField(
      priceInput,
      priceError,
      'Price must be a whole number of cents (e.g. 1999 for $19.99).',
      (v) => /^\d+$/.test(v.trim()) && parseInt(v.trim(), 10) >= 0,
    ),
  );
}

function validateField(input, errorEl, message, extraCheck) {
  const value = input.value;
  const isEmpty = !value.trim();
  const failsExtra = extraCheck && !isEmpty && !extraCheck(value);

  if (isEmpty && input.required) {
    setFieldError(input, errorEl, message);
    return false;
  }
  if (failsExtra) {
    setFieldError(input, errorEl, message);
    return false;
  }
  clearFieldError(input, errorEl);
  return true;
}

function setFieldError(input, errorEl, message) {
  input.setAttribute('aria-invalid', 'true');
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function clearFieldError(input, errorEl) {
  input.removeAttribute('aria-invalid');
  errorEl.hidden = true;
  errorEl.textContent = '';
}

function validateForm() {
  const nameOk = validateField(nameInput, nameError, 'Product name is required.');
  const priceOk = validateField(
    priceInput,
    priceError,
    'Price must be a whole number of cents (e.g. 1999 for $19.99).',
    (v) => /^\d+$/.test(v.trim()) && parseInt(v.trim(), 10) >= 0,
  );

  if (!nameOk) {
    nameInput.focus();
    return false;
  }
  if (!priceOk) {
    priceInput.focus();
    return false;
  }
  return true;
}

async function handleSubmit(adapter) {
  submitBtn.disabled = true;
  submitBtn.textContent = editingId ? 'Saving…' : 'Creating…';

  try {
    const description = htmlToRichText(descEditor.innerHTML);
    const categoryId = categorySelect.value || null;
    const price = parseInt(priceInput.value.trim(), 10);
    const sku = skuInput.value.trim() || null;

    let product;
    if (editingId) {
      product = await adapter.products.update(editingId, {
        name: nameInput.value.trim(),
        price,
        sku,
        categoryId,
        description,
      });
    } else {
      product = await adapter.products.create({
        name: nameInput.value.trim(),
        price,
        sku,
        categoryId,
        description,
      });
    }

    // Handle image
    const imageUrl = imageUrlInput.value.trim();
    const imageAlt = imageAltInput.value.trim();

    if (imageUrl) {
      if (editingId && originalImages[0]) {
        // Delete old image record and create new if URL changed
        if (originalImages[0].url !== imageUrl) {
          await adapter.images.delete(originalImages[0].id);
          await adapter.images.create({
            productId: product.id,
            url: imageUrl,
            altText: imageAlt || product.name,
          });
        } else if (imageAlt && originalImages[0].altText !== imageAlt) {
          // Alt text changed — no update method on image; delete + recreate
          await adapter.images.delete(originalImages[0].id);
          await adapter.images.create({
            productId: product.id,
            url: imageUrl,
            altText: imageAlt,
          });
        }
      } else if (!editingId) {
        await adapter.images.create({
          productId: product.id,
          url: imageUrl,
          altText: imageAlt || product.name,
        });
      }
    } else if (editingId && originalImages[0]) {
      // Image URL cleared — delete old image
      await adapter.images.delete(originalImages[0].id);
    }

    showToast(editingId ? 'Product updated.' : 'Product created.');
    setTimeout(() => {
      location.href = 'index.html';
    }, 800);
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = editingId ? 'Update product' : 'Save product';
  }
}

init().catch((err) => {
  console.error(err);
  showToast(`Initialization error: ${err.message}`, 'error');
});
