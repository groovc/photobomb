import { getAllPeople, addPerson } from './db.js';
import { removeBg } from './bg-removal.js';

// Resolve paths relative to this module file so the app works in any subdirectory
const BASE_URL = new URL('..', import.meta.url).href;
const BUNDLED_MANIFEST = new URL('assets/people/manifest.json', BASE_URL).href;

async function loadBundledPeople() {
  try {
    const res = await fetch(BUNDLED_MANIFEST);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

/**
 * Render the person picker grid.
 *
 * @param {HTMLElement} gridEl
 * @param {(person: object) => void} onSelect - called with the selected person
 */
export async function renderPicker(gridEl, onSelect) {
  gridEl.innerHTML = '';

  const [bundled, userPeople] = await Promise.all([
    loadBundledPeople(),
    getAllPeople(),
  ]);

  const all = [
    ...bundled.map((p) => ({ ...p, source: 'bundled' })),
    ...userPeople.map((p) => ({ ...p, source: 'user' })),
  ];

  if (all.length === 0) {
    gridEl.innerHTML = '<p style="color:var(--text-muted);text-align:center;grid-column:1/-1;padding:24px">No people yet. Upload someone below.</p>';
    return;
  }

  for (const person of all) {
    const card = createCard(person, onSelect);
    gridEl.appendChild(card);
  }
}

function createCard(person, onSelect) {
  const card = document.createElement('div');
  card.className = 'person-card';
  card.dataset.id = person.id ?? person.slug;

  let imageUrl;
  if (person.source === 'bundled') {
    imageUrl = new URL(`assets/people/${person.slug}.png`, BASE_URL).href;
  } else {
    const blob = person.previewBlob ?? person.imageBlob;
    imageUrl = URL.createObjectURL(blob);
  }

  card.innerHTML = `
    <img src="${imageUrl}" alt="${person.name}" loading="lazy">
    <span class="person-name">${person.name}</span>
  `;

  card.addEventListener('click', () => {
    document.querySelectorAll('.person-card').forEach((c) => c.classList.remove('selected'));
    card.classList.add('selected');
    onSelect({
      name: person.name,
      imageBlob: person.source === 'user' ? (person.previewBlob ?? person.imageBlob) : null,
      imageUrl: person.source === 'bundled' ? new URL(`assets/people/${person.slug}.png`, BASE_URL).href : null,
    });
  });

  return card;
}

/**
 * Handle a user-chosen file: run background removal (best effort), store in DB,
 * then re-render the grid.
 *
 * @param {File} file
 * @param {HTMLElement} gridEl
 * @param {(person: object) => void} onSelect
 */
export async function handleUpload(file, gridEl, onSelect) {
  const name = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');

  // Add a placeholder card with a spinner while processing
  const placeholder = document.createElement('div');
  placeholder.className = 'person-card processing';
  placeholder.innerHTML = `
    <div class="card-spinner"><div class="spinner"></div></div>
    <span class="person-name">${name}</span>
  `;
  gridEl.appendChild(placeholder);

  let previewBlob = null;
  let failed = false;
  let failureMessage = 'Background removal failed';

  try {
    previewBlob = await removeBg(file);
  } catch (error) {
    // Background removal unavailable or failed — reject upload per spec
    failed = true;
    failureMessage = error?.message || failureMessage;
    console.error('Background removal failed', {
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      error,
    });
  }

  if (failed) {
    placeholder.classList.remove('processing');
    placeholder.classList.add('error');
    placeholder.querySelector('.card-spinner').remove();
    placeholder.insertAdjacentHTML(
      'afterbegin',
      `<div style="padding:8px;font-size:11px;color:#ff6b6b;text-align:center;position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">${failureMessage}</div>`
    );
    // Remove the error card after 3s
    setTimeout(() => placeholder.remove(), 3000);
    return;
  }

  const person = {
    name,
    description: `a person named ${name}`,
    imageBlob: file,
    previewBlob,
  };

  const id = await addPerson(person);
  person.id = id;
  person.source = 'user';

  // Replace placeholder with real card
  const card = createCard(person, onSelect);
  gridEl.replaceChild(card, placeholder);
}
