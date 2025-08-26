import 'package:flutter/material.dart';
import 'package:farad_app/login_page.dart'; // Make sure this path is correct for your project
import 'package:firebase_core/firebase_core.dart';
import 'firebase_options.dart';

// The main function must now be 'async'
void main() async {
  // These two lines are required to initialize Firebase before the app runs
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );

  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    // THE FIX IS HERE: Added the 'return' keyword
    return MaterialApp(
      title: 'Farad',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: Colors.black,
      ),
      home: const LoginPage(),
    );
  }
}
