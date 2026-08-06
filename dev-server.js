// Local development / testing entry point. Uses the file-backed store in
// data/ instead of Netlify Blobs. Production runs netlify/functions/app.js.
const store = require('./src/store');
store.initFiles();

const { createApp } = require('./server-app');
const app = createApp();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MAGA League office (dev) on port ${PORT}`));
