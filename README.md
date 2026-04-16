# InspectAI MVP

AI-powered home inspection report generator.

## Features (MVP)

- 📸 Upload up to 10 photos
- 🤖 AI analysis using Qwen-VL
- ✏️ Edit AI-generated descriptions
- 📄 Export professional PDF report

## Quick Deploy

### Vercel (Recommended)

```bash
cd inspectai-landing
vercel --prod
```

## Environment Variables

Set these in Vercel Dashboard → Settings → Environment Variables:

| Variable | Description |
|----------|-------------|
| `QWEN_API_KEY` | Alibaba Qwen API key (for image analysis) |

## Get Qwen API Key

1. Go to [Alibaba Cloud](https://www.alibabacloud.com/)
2. Create account / Login
3. Navigate to DashScope Console
4. Create API Key
5. Copy and add to Vercel

## Usage

1. Deploy to Vercel
2. Open `https://your-domain.vercel.app/app.html`
3. Upload property photos
4. Click "Analyze Photos with AI"
5. Review and edit descriptions
6. Export PDF report

## Tech Stack

- Frontend: Pure HTML/CSS/JS
- Backend: Vercel Serverless Functions
- AI: Qwen-VL (Alibaba)
- PDF: pdfkit

## Next Steps

- [ ] Add user authentication
- [ ] Save reports to cloud storage
- [ ] Add payment integration (PayPal credits)
- [ ] Mobile app (React Native)
- [ ] Integrate with existing tools (HomeGauge, Spectora)
