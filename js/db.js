const DB_NAME = 'photobomb';
const DB_VERSION = 1;
const STORE = 'people';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function getAllPeople() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readonly').getAll();
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function addPerson(person) {
  // person: { name, description, imageBlob, previewBlob }
  // previewBlob is the background-removed PNG if available, else same as imageBlob
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readwrite').add(person);
    req.onsuccess = (e) => resolve(e.target.result); // returns id
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function deletePerson(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readwrite').delete(id);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}
