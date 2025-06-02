# Vercel Deployment Guide

This Express.js application has been restructured for Vercel deployment using serverless functions.

## Project Structure

```
project-root/
├── api/
│   └── index.ts          # Main serverless function entry point
├── src/
│   ├── db/               # Database configuration
│   ├── routes/           # Express routes
│   ├── services/         # Business logic
│   └── utils/            # Utility functions
├── vercel.json           # Vercel configuration
├── package.json          # Dependencies and scripts
└── tsconfig.json         # TypeScript configuration
```

## Key Changes for Vercel

1. **Serverless Function Entry Point**: `api/index.ts` exports the Express app without calling `app.listen()`
2. **Route Configuration**: `vercel.json` routes all requests to the serverless function
3. **Database Initialization**: Lazy initialization for serverless environment
4. **TypeScript Support**: Updated `tsconfig.json` to include the `api` directory

## Environment Variables

Set these environment variables in your Vercel dashboard:

- `SUPABASE_DB_URL` - Your Supabase database connection string
- `WHATSAPP_TOKEN` - WhatsApp API token
- `WEBHOOK_VERIFY_TOKEN` - Webhook verification token
- Any other environment variables your app requires

## Deployment Steps

1. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy**:
   ```bash
   vercel
   ```

4. **Set Environment Variables**:
   - Go to your Vercel dashboard
   - Select your project
   - Go to Settings > Environment Variables
   - Add all required environment variables

## Local Development

To test the Vercel environment locally:

```bash
vercel dev
```

This will start a local development server that emulates the Vercel environment.

## API Endpoints

After deployment, your API will be available at:

- `https://your-app.vercel.app/` - Root endpoint with API information
- `https://your-app.vercel.app/health` - Health check
- `https://your-app.vercel.app/webhook` - WhatsApp webhook
- `https://your-app.vercel.app/admin` - Admin routes

## Troubleshooting

1. **Build Errors**: Check the Vercel build logs for TypeScript compilation errors
2. **Runtime Errors**: Check the Vercel function logs for runtime issues
3. **Database Connection**: Ensure your database URL is correctly set in environment variables
4. **Cold Starts**: First requests may be slower due to serverless cold starts

## Development vs Production

- **Development**: Use `npm run dev` to run the original Express server locally
- **Production**: The Vercel deployment uses the serverless function in `api/index.ts`

Both setups share the same business logic and routes from the `src` directory. 