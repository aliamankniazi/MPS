# Project Migration Guide

This document outlines the steps to move the **PumpPal** application to a new GitHub account and a new Firebase project.

## 1. Transferring to a New GitHub Account

### Method A: Using the Terminal (Recommended)
1. **Clone the current repository**:
   ```bash
   git clone https://github.com/CURRENT_USER/pumppal.git
   cd pumppal
   ```
2. **Create a new repository** on your other GitHub account (do not initialize with README or License).
3. **Change the remote URL**:
   ```bash
   git remote set-url origin https://github.com/aliamankniazi/MPS.git
   ```
4. **Prepare the branch**:
   Ensure you have a commit and your branch is named `main`:
   ```bash
   git add .
   git commit -m "Migration to new account"
   git branch -M main
   ```
5. **Push the code**:
   ```bash
   git push -u origin main
   ```

### Method B: Repository Forking
1. Log in to your **new** GitHub account.
2. Navigate to the original repository URL.
3. Click the **Fork** button at the top right to create a copy in your new account.

---

## 2. Moving to a New Firebase Project

If you are setting up a fresh database for the new account, follow these steps:

1. **Create a Firebase Project**: Go to [Firebase Console](https://console.firebase.google.com/) and create a new project.
2. **Enable Services**:
   - **Firestore**: Create a database in "Production" or "Test" mode.
   - **Authentication**: Enable "Email/Password" provider.
3. **Get Config Keys**:
   - Add a "Web App" to your Firebase project.
   - Copy the `firebaseConfig` object.
4. **Update the Code**:
   - Open `src/firebase/config.ts` in your editor.
   - Replace the existing values with the ones from your new project.
5. **Deploy**:
   - Set up **Firebase App Hosting** or **GitHub Actions** to link your new GitHub repo to the new Firebase project.

## 3. Security Rules
Ensure you copy the rules from `firestore.rules` in this project to your new Firebase console to maintain data security.

## 4. Environment Variables
If you are using AI features (Genkit), ensure you set the `GOOGLE_API_KEY` in the secrets/environment variables of your new hosting provider.
