# Farad App - Build and Deployment Guide

## Production Ready Implementation Complete

The Farad Flutter Web App has been fully implemented with production-ready features:

### Features Implemented

1. **Material 3 UI** - Modern, responsive design with Dart Material 3 components
2. **Firebase Integration**
   - Real-time Firestore database for trucks and orders
   - Firebase Authentication
   - ServerTimestamp for data consistency
3. **Payment Integration**
   - Flutterwave payment gateway integration
   - Secure payment processing
   - Order status tracking
4. **Live Data Sync**
   - Real-time truck listings via Firestore StreamBuilder
   - Live order management
   - Instant driver-customer updates

## Local Build Instructions

Follow these steps on your local machine:

### Prerequisites
- Flutter SDK (3.3.0 or higher)
- Firebase CLI
- Node.js (for Firebase Hosting)

### Step 1: Setup Flutter
```bash
flutter pub get
flutter clean
```

### Step 2: Enable Web Platform
```bash
flutter config --enable-web
flutter create .
```

### Step 3: Build for Web
```bash
flutter build web --release
```

This will create optimized web files in `build/web/`

### Step 4: Deploy to Firebase Hosting

1. Install Firebase CLI:
```bash
npm install -g firebase-tools
```

2. Login to Firebase:
```bash
firebase login
```

3. Initialize Firebase in your project (if not done):
```bash
firebase init hosting
```

When prompted:
- Select your Firebase project
- Set public directory to: `build/web`
- Do NOT rewrite all URLs (select 'N')

4. Deploy:
```bash
flutter build web --release
firebase deploy
```

## Firebase Configuration

The app uses these Firestore collections:

### trucks collection
- Document ID: driver's UID
- Fields:
  - driverId, driverName, truckModel, licensePlate
  - chargeAmount, isAvailable, rating
  - lastUpdated (server timestamp)

### orders collection
- Fields:
  - customerId, customerName
  - driverId, driverName
  - pickupLocation, deliveryLocation
  - amount, paymentStatus, orderStatus
  - transactionRef, createdAt, completedAt

## Testing the App

1. **Sign Up** - Create a new account
2. **Driver Mode** - Enable driver mode and register a truck
3. **Browse Trucks** - As customer, see available trucks in real-time
4. **Place Order** - Select truck and location
5. **Payment** - Process payment (test mode)
6. **Confirmation** - Receive order confirmation

## Environment Variables

Flutterwave public key is configured in:
- `lib/services/flutterwave_service.dart`
- Public Key: `FLWPUBK-16a72bd54f4eb876e6a705d899b049d8-X`

For production, use your own Flutterwave account and update the key.

## Files Modified/Created

- `pubspec.yaml` - Added flutter_dotenv and http dependencies
- `lib/main.dart` - Material 3 theme
- `lib/home_screen.dart` - Driver mode with Firestore truck registration
- `lib/confirm_page.dart` - Payment processing with Flutterwave
- `lib/services/flutterwave_service.dart` - Payment service
- `lib/models/order_model.dart` - Order data model

## Support

For issues with Firebase, visit: https://firebase.google.com/docs
For Flutterwave integration: https://developer.flutterwave.com/

