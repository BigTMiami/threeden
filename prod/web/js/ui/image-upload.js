// @ts-check
/**
 * image-upload.js — turning photos people pick into something small enough
 * to save in the browser.
 *
 *   const photos = await readImages(fileInput.files);   // [{ src, width, height, name }]
 *
 * Each photo is scaled down so its longest side is at most 1280 pixels and
 * saved as a JPEG data URL (roughly 100–250 KB). The prototype keeps
 * everything in localStorage, which only holds a few megabytes, so big
 * originals would fill it after a couple of photos. A real server would
 * keep the originals.
 */

const MAX_SIDE_PX = 1280;
const JPEG_QUALITY = 0.8;

/** Read and shrink every image file in a FileList (other files are skipped). */
export async function readImages(fileList) {
  const files = [...fileList].filter((file) => file.type.startsWith('image/'));
  const results = [];
  for (const file of files) {
    try {
      results.push(await shrinkImage(file));
    } catch (error) {
      console.warn('[3den] Could not read image:', file.name, error);
    }
  }
  return results;
}

function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, MAX_SIDE_PX / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.round(image.naturalWidth * scale);
      const height = Math.round(image.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff'; // transparent PNGs get a white background as JPEGs
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve({ src: canvas.toDataURL('image/jpeg', JPEG_QUALITY), width, height, name: file.name.replace(/\.[^.]+$/, '') });
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Not an image the browser can read')); };
    image.src = url;
  });
}

/** A file input + button: "Add photos". Calls onPhotos with the shrunk photos. */
export function photoPicker({ label = 'Add photos', multiple = true, onPhotos, buttonClass = 'button button--small' }) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = multiple;
  input.hidden = true;
  input.addEventListener('change', async () => {
    const photos = await readImages(input.files);
    input.value = '';
    if (photos.length) onPhotos(photos);
  });
  const button = document.createElement('button');
  button.type = 'button';
  button.className = buttonClass;
  button.textContent = label;
  button.addEventListener('click', () => input.click());
  const wrapper = document.createElement('span');
  wrapper.append(button, input);
  return wrapper;
}
