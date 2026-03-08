# Leaf

Leaf is a local-first note-taking app built with `React`, `TypeScript`, and `Vite`.

## Requirements

- `Node.js` 20+
- `npm`

## Local Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
```

The production output is generated in `dist/`.

## Deployment

### Vercel

This repo includes `vercel.json` with:

- framework: `vite`
- build command: `npm run build`
- output directory: `dist`
- SPA rewrite to `index.html`

You can deploy it either from the Vercel dashboard by importing the GitHub repo, or with the CLI:

```bash
vercel
vercel --prod
```

### GitHub

Push the repository to GitHub as a normal git repository:

```bash
git add .
git commit -m "Prepare Leaf for deployment"
git push origin <branch>
```

## Notes

- Data is stored locally in the browser using IndexedDB.
- The app builds successfully with `npm run build`.
- There is still a large production chunk from the current app bundle. Deployment works, but bundle-splitting is the next technical improvement worth doing.
