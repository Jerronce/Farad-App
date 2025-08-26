// lib/me_screen.dart - FINAL VERSION

import 'package:flutter/material.dart';
import 'me_page.dart'; // <-- THIS IS THE FIX. Changed to a direct import.

class MeScreen extends StatelessWidget {
  final String name;
  const MeScreen({super.key, required this.name});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          const SizedBox(height: 40),
          // --- PROFILE PICTURE ---
          const CircleAvatar(
            radius: 60,
            backgroundColor: Colors.grey,
            // In a real app, you would use a NetworkImage here if the user has uploaded a photo
            child: Icon(Icons.person, size: 60, color: Colors.white),
          ),
          const SizedBox(height: 20),

          // --- USER NAME ---
          Text(
            name, // This name is passed in from the MainPage
            style: const TextStyle(
                color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),

          // --- USER EMAIL (Placeholder) ---
          const Text(
            'jerry@example.com', // In a real app, this would also be passed in
            style: TextStyle(color: Colors.white70, fontSize: 16),
          ),
          const SizedBox(height: 40),

          // --- MENU ITEMS ---
          ListTile(
            leading: const Icon(Icons.settings, color: Colors.white70),
            title:
                const Text('Settings', style: TextStyle(color: Colors.white)),
            onTap: () {
              // TODO: You can add navigation to your settings page here if you want
            },
          ),
          ListTile(
            leading: const Icon(Icons.help_outline, color: Colors.white70),
            title: const Text('Help & Support',
                style: TextStyle(color: Colors.white)),
            onTap: () {},
          ),

          const Spacer(), // This pushes the button to the bottom of the screen

          // --- EDIT PROFILE BUTTON ---
          ElevatedButton.icon(
            icon: const Icon(Icons.edit),
            label: const Text('Edit Profile'),
            style: ElevatedButton.styleFrom(
              minimumSize: const Size(double.infinity, 50),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(30),
              ),
            ),
            onPressed: () {
              // This navigates to the MePage where the user can edit their details
              Navigator.push(
                context,
                MaterialPageRoute(builder: (context) => MePage(name: name)),
              );
            },
          ),
        ],
      ),
    );
  }
}
