# Smart Meal Planner Deployment Notes

## Cloud Sync Providers

This build supports two server-managed sync providers. The API automatically picks the first available option.

1. **Vercel KV (recommended for fully automated sync)**
   - Add the Vercel KV integration to your project.
   - Ensure the environment variables `KV_REST_API_URL` and `KV_REST_API_TOKEN` (or the read/write token) are available at build/runtime.
   - Optional: override the key prefix with `MEAL_SYNC_PREFIX` when you want separate environments.

2. **WebDAV storage (OneDrive / Nextcloud / NAS)**
   - Provide `WEBDAV_BASE_URL`, `WEBDAV_USERNAME`, and `WEBDAV_PASSWORD`.
   - `WEBDAV_ROOT_PATH` (default `MealPlanner`) points to the folder that will receive JSON backups. Create the folder ahead of time or ensure the credentials have permission to create it.
   - OneDrive personal WebDAV example: `WEBDAV_BASE_URL=https://d.docs.live.net/<cid>/` and `WEBDAV_ROOT_PATH=Documents/MealPlanner`.

If neither provider is configured the app falls back to local storage, shows a setup hint, and still allows manual export/import.

## Manual backup & transfer

A manual backup card appears in the UI. Use **Export JSON** to download all dishes, the active profile, and group members. Store the JSON in any cloud drive (OneDrive, iCloud Drive, etc.). Use **Import JSON** on another device to restore.

## Menu import tips

- You can drag-and-drop PDF, TXT, or DOCX files into “Import from File”. Textual PDFs are parsed directly; image-only PDFs fall back to DeepSeek OCR.
- “Paste Text” opens a modal where you can paste plain text. Structured formats such as `菜名, 餐厅, 价格, 蛋白, 碳水, 脂肪, 分类` parse locally without calling the model.
- When the text is unstructured the SiliconFlow model (default `Qwen/Qwen2.5-72B-Instruct`) cleans and estimates the macros automatically.

