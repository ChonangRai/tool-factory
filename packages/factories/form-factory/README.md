# Form Factory 📝

> **Enterprise Form Management with Receipt Collection & OCR**

Form Factory is a powerful, enterprise-ready solution for creating, managing, and processing form submissions. Perfect for receipt collection, expense management, contact forms, surveys, and data collection with automatic OCR extraction, secure cloud storage, and real-time notifications.

[![Live Demo](https://img.shields.io/badge/demo-live-success)](https://forms.toolfactory.uk)
[![Version](https://img.shields.io/badge/version-1.0.0-blue)](package.json)

## ✨ Features

### 🔍 **Smart OCR Technology**
- Automatic text extraction from receipts, invoices, and documents
- Support for multiple languages and currencies
- High accuracy data recognition
- Extract key information: date, amount, vendor, items, totals

### 📋 **Versatile Form Management**
- **Receipt Collection**: Perfect for expense tracking and reimbursement workflows
- **Contact Forms**: Collect inquiries, feedback, and customer information
- **Data Submissions**: Custom forms for any business need
- **File Uploads**: Multi-format support (PDF, JPG, PNG, etc.)

### 💾 **Secure Cloud Storage**
- End-to-end encrypted storage
- Automatic backup and versioning
- Unlimited storage capacity
- GDPR compliant

### 📊 **Powerful Organization**
- Real-time submission monitoring
- Category-based organization
- Custom tags and folders
- Advanced search and filtering
- Export to CSV and Excel

### 🔔 **Real-time Notifications**
- Instant submission confirmations
- Processing status updates
- Email notifications
- Webhook integrations for custom workflows

### 🌐 **Multi-tenant Architecture**
- Organization-level isolation
- Role-based access control (RBAC)
- Team collaboration features
- Secure invitation system

### 📱 **Responsive Design**
- Mobile-first approach
- Works on all devices
- Progressive Web App (PWA) ready
- Offline capabilities

## 🎯 Use Cases

### Receipt Collection & Expense Management
- Employees submit receipts via mobile or desktop
- Automatic OCR extracts merchant, date, amount
- Managers review and approve expenses
- Export for accounting systems

### Contact & Lead Forms
- Capture customer inquiries
- Automatic  email notifications
- CRM integration ready
- Spam protection with reCAPTCHA

### Document Collection
- Collect invoices, contracts, applications
- Secure file storage
- Audit trail and tracking
- Multi-format support

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Supabase account
- Google reCAPTCHA keys (optional)

### Installation

```bash
# Navigate to the project directory
cd packages/factories/form-factory

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Start development server
npm run dev
```

### Environment Variables

Create a `.env` file with the following:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_RECAPTCHA_SITE_KEY=your_recaptcha_site_key
```

## 📖 Usage

### For End Users

1. **Upload Files**
   - Drag and drop receipts, documents, or images
   - Supports multiple files
   - Real-time upload progress

2. **Fill Form**
   - Auto-populate from OCR
   - Validate required fields
   - Add custom notes and metadata

3. **Submit**
   - Instant confirmation
   - Email notification
   - Unique reference number

### For Administrators

1. **Dashboard Access**
   - Login at `/auth`
   - View all submissions
   - Monitor analytics

2. **Manage Submissions**
   - Review and process submissions
   - Update status (new, processed, archived)
   - Export data (CSV, Excel)

3. **Team Management**
   - Invite team members
   - Assign roles (admin, manager, staff)
   - Set permissions

## 🏗️ Architecture

### Tech Stack
- **Frontend**: React 18 + TypeScript + Vite
- **UI Framework**: shadcn/ui + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **OCR**: Tesseract.js
- **Forms**: React Hook Form + Zod validation
- **State Management**: TanStack Query

### Database Schema
- **Organizations**: Multi-tenant organization data
- **Profiles**: User profiles and preferences
- **Forms**: Form configurations and settings
- **Submissions**: Form submission data with files
- **Files**: Uploaded file metadata
- **Roles**: User permissions (RBAC)

## 🔒 Security

- ✅ Row Level Security (RLS) on all tables
- ✅ Encrypted file storage
- ✅ reCAPTCHA spam protection
- ✅ Rate limiting
- ✅ SQL injection prevention
- ✅ XSS protection
- ✅ CORS configuration
- ✅ Audit logging

## 📊 SEO & Performance

### SEO Optimization
- ✅ Comprehensive meta tags (title, description, keywords)
- ✅ Open Graph protocol for social sharing
- ✅ Twitter Card support
- ✅ Schema.org structured data (JSON-LD)
- ✅ Geo-targeting meta tags
- ✅ Canonical URLs
- ✅ Sitemap ready

### Performance
- ✅ Code splitting and lazy loading
- ✅ Image optimization
- ✅ Caching strategies
- ✅ Lighthouse score: 95+
- ✅ Core Web Vitals optimized

## 🌍 International Support

- 🌐 Global distribution via Vercel Edge Network
- 💱 Multi-currency support
- 🌏 Multi-language ready
- ⏰ Timezone detection

## 📱 API Integration

### REST API Endpoints
```typescript
// Public form submission
POST /api/forms/:form_id/submit

// Admin endpoints (authenticated)
GET /api/submissions
GET /api/submissions/:id
PATCH /api/submissions/:id
DELETE /api/submissions/:id
```

### Webhooks
Configure webhooks to receive real-time updates:
- `submission.created`
- `submission.updated`
- `submission.deleted`

## 📦 Deployment

### Production Build
```bash
npm run build
```

### Deploy to Vercel
```bash
vercel --prod
```

### Environment Setup
1. Configure Supabase production database
2. Run migration: `000_complete_comprehensive_migration.sql`
3. Set up Supabase URL redirects (see [PRODUCTION_EMAIL_REDIRECT_FIX.md](supabase/PRODUCTION_EMAIL_REDIRECT_FIX.md))
4. Configure environment variables in Vercel
5. Deploy

## 🆘 Support

- 📧 Email: support@toolfactory.uk
- 🌐 Website: https://toolfactory.uk
- 💬 Discord: [Join our community](https://discord.gg/toolfactory)

## 🗺️ Roadmap

- [ ] Mobile apps (iOS & Android)
- [ ] AI-powered data extraction and categorization
- [ ] Bulk import/export
- [ ] Advanced reporting and analytics
- [ ] Integration with accounting software (QuickBooks, Xero)
- [ ] Multi-language support
- [ ] Custom branding options

## 🙏 Acknowledgments

Built with ❤️ by [ToolFactory](https://toolfactory.uk)

---

**Form Factory** - Simplifying data collection and form management, one submission at a time.
