# Frontend Integration Setup

## Overview

The WhatsApp Bot CRM system now includes a React-based frontend dashboard for viewing and managing data. Both the backend API and frontend interface run together as part of the same service.

## Architecture

- **Backend API**: Node.js/Express application running on port 3000
- **Frontend Dashboard**: React/Vite application running on port 3001
- **Database**: Supabase PostgreSQL database
- **Service Management**: Systemd service manages both applications

## Ports and Access

- **Backend API**: http://localhost:3000
  - WhatsApp webhook endpoints
  - REST API endpoints
  - Admin management interfaces

- **Frontend Dashboard**: http://localhost:3001
  - Data visualization
  - Customer management interface
  - Employee management
  - Inventory tracking
  - Analytics and reporting

## Development

### Running in Development Mode
```bash
# Run both backend and frontend in development mode
npm run dev:all

# Run individual services
npm run dev          # Backend only
npm run frontend:dev # Frontend only
```

### Building for Production
```bash
# Build both applications
npm run build:all

# Build individual applications
npm run build          # Backend only
npm run frontend:build # Frontend only
```

### Running in Production Mode
```bash
# Run both applications in production mode
npm run start:all

# Run individual applications
npm run start           # Backend only
npm run frontend:preview # Frontend only
```

## Service Management

The systemd service `whatsapp-bot.service` has been updated to build and run both applications:

```bash
# Start the service
sudo systemctl start whatsapp-bot

# Check status
sudo systemctl status whatsapp-bot

# View logs
sudo journalctl -u whatsapp-bot -f
```

## Frontend Features

The frontend dashboard includes:

- **Real-time Data Visualization**: Charts and graphs showing business metrics
- **Customer Management**: View and manage customer interactions
- **Employee Management**: Track employee activities and performance
- **Inventory Management**: Monitor stock levels and transactions
- **Communication Logs**: WhatsApp message history and analytics
- **Admin Tools**: User management and system configuration

## Configuration

### Environment Variables

Ensure your `.env` file includes all necessary variables for both backend and frontend:

```env
# Backend Configuration
DATABASE_URL=your_supabase_database_url
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# WhatsApp Configuration
WHATSAPP_TOKEN=your_whatsapp_token
WHATSAPP_VERIFY_TOKEN=your_verify_token

# Zoho Email Configuration
ZOHO_USER=your_zoho_email
ZOHO_PASS=your_zoho_app_password

# Frontend will automatically use the same Supabase configuration
```

### Database Connection

The frontend uses the same Supabase database as the backend, ensuring data consistency across both interfaces.

## Troubleshooting

### Common Issues

1. **Port Conflicts**: 
   - Ensure ports 3000 and 3001 are available
   - Check `netstat -tlnp | grep -E ':(3000|3001)'`

2. **Build Failures**:
   - Run `npm install` to ensure all dependencies are installed
   - Check for TypeScript errors with `npm run build:all`

3. **Service Startup Issues**:
   - Check logs with `sudo journalctl -u whatsapp-bot -f`
   - Verify environment variables are properly set

### Development Tips

- Use `npm run dev:all` for hot-reloading during development
- The frontend automatically proxies API requests to the backend
- Both applications share the same node_modules and dependencies

## Security Considerations

- Frontend runs on a different port for security isolation
- API endpoints require proper authentication
- Database access is controlled through Supabase RLS policies
- Environment variables are not exposed to the frontend client code

## Future Enhancements

Planned improvements include:

- Real-time WebSocket connections for live updates
- Advanced analytics and reporting features  
- Mobile-responsive design optimizations
- Integration with additional business tools
- Enhanced user role management 