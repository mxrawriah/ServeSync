# ServeSync

A modern web application for managing user availability and scheduling with Google OAuth authentication and admin controls.

## 🚀 Features

- **Google OAuth Authentication**: Secure sign-in with Google accounts
- **User Management**: Admin interface for managing users
- **Availability Tracking**: Schedule and track user availability
- **Responsive Design**: Clean, modern UI that works on all devices
- **SQLite Database**: Lightweight, file-based database for easy deployment
- **Session Management**: Secure session handling with Express sessions

## 🛠 Tech Stack

- **Backend**: Node.js, Express.js
- **Authentication**: Passport.js with Google OAuth 2.0
- **Database**: SQLite3
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Session Storage**: express-session

## 📋 Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Google OAuth credentials (Client ID and Client Secret)

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/trnathaliedomingo/Mariah.git
   cd Mariah
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**

   Create a `.env` file in the root directory:
   ```env
   GOOGLE_CLIENT_ID=your_google_client_id_here
   GOOGLE_CLIENT_SECRET=your_google_client_secret_here
   SESSION_SECRET=your_session_secret_here
   ```

4. **Configure Google OAuth**

   - Go to the [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Enable the Google+ API
   - Create OAuth 2.0 credentials
   - Add your domain to authorized origins (e.g., `http://localhost:3000`)
   - Add redirect URI: `http://localhost:3000/auth/google/callback`

## 🚀 Usage

1. **Start the server**
   ```bash
   npm start
   ```

2. **Open your browser**
   Navigate to `http://localhost:3000`

3. **Sign in**
   Click "Sign in with Google" to authenticate

4. **Admin Features**
   - View all users in the admin panel
   - Delete users using the action buttons
   - Manage availability schedules

## 📡 API Endpoints

### Authentication
- `GET /auth/google` - Initiate Google OAuth login
- `GET /auth/google/callback` - OAuth callback handler
- `GET /logout` - Logout user

### Users
- `GET /api/users` - Get all users (admin only)
- `DELETE /api/users/:id` - Delete a user (admin only)

### Availability
- `GET /api/availability` - Get availability data
- `POST /api/availability` - Create/update availability

## 🗂 Project Structure

```
Mariah/
├── server.js              # Main Express server
├── servesync (3).html     # Main HTML page
├── servesync.js           # Frontend JavaScript
├── servesync.css          # Stylesheets
├── servesync.db           # SQLite database
├── package.json           # Dependencies and scripts
├── .env                   # Environment variables
└── README.md             # This file
```

## 🔐 Security Notes

- Never commit the `.env` file to version control
- Use strong, unique session secrets in production
- Configure HTTPS in production environments
- Regularly update dependencies for security patches

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Troubleshooting

### Common Issues

**Server won't start**
- Check that all dependencies are installed: `npm install`
- Verify your `.env` file exists and contains valid credentials
- Ensure port 3000 is not already in use

**Google OAuth not working**
- Verify your Google OAuth credentials are correct
- Check that authorized origins and redirect URIs match your domain
- Ensure the Google+ API is enabled in your Google Cloud project

**Database errors**
- Check that `servesync.db` exists and is writable
- Run database migrations if needed

## 📞 Support

If you encounter any issues or have questions, please open an issue on GitHub.

---

**ServeSync** - Keep your team synchronized! 🎯