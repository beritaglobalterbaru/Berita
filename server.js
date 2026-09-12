const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// Root - serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Dynamic news detail route: /berita/:slug
app.get('/berita/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Fallback for SPA-like routing (query style also supported via client)
app.get('/berita', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'index.html'));
});

// Start server (for local development)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🚀 Berita Global Terbaru berjalan di http://localhost:${PORT}`);
    console.log(`   Tekan Ctrl+C untuk menghentikan server.\n`);
  });
}

// Export for Vercel
module.exports = app;
