# Test assets

Sample inputs for developing and testing scanner flows. These files are **not**
part of the app bundle — they live outside `public/`, so the PWA service worker
does not precache them and they are never served to users.

- `test_label.jpg` — a photo of a shoe-box label, used as a fixture for the
  upcoming label-recognition (OCR/vision) flow.
