// lib/home_screen.dart - FINAL LIVE VERSION

import 'package:flutter/material.dart';
import 'types_of_trucks_page.dart'; // <-- THIS IS THE FIX. Changed to a direct import.
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class HomeScreen extends StatefulWidget {
  final String name;
  const HomeScreen({super.key, required this.name});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  bool _isDriverMode = false;
  final _formKey = GlobalKey<FormState>();
  // NEW: Controllers to get the text from the fields
  final _truckModelController = TextEditingController();
  final _licensePlateController = TextEditingController();
  final _chargeAmountController = TextEditingController();

  @override
  void dispose() {
    _truckModelController.dispose();
    _licensePlateController.dispose();
    _chargeAmountController.dispose();
    super.dispose();
  }

  // This function now saves data to Firebase
  Future<void> _showAddTruckDialog(BuildContext context) async {
    return showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: Colors.grey[900],
          title: const Text('Add Your Truck',
              style: TextStyle(color: Colors.white)),
          content: SingleChildScrollView(
            child: Form(
              key: _formKey,
              child: ListBody(
                children: <Widget>[
                  const Text(
                      'Please provide your vehicle details to become available.',
                      style: TextStyle(color: Colors.white70)),
                  const SizedBox(height: 20),
                  TextFormField(
                    controller: _truckModelController,
                    decoration: const InputDecoration(
                        labelText: 'Truck Model (e.g., DAF CF)',
                        labelStyle: TextStyle(color: Colors.white70)),
                    style: const TextStyle(color: Colors.white),
                    validator: (value) =>
                        value!.isEmpty ? 'Please enter your truck model' : null,
                  ),
                  TextFormField(
                    controller: _licensePlateController,
                    decoration: const InputDecoration(
                        labelText: 'License Plate Number',
                        labelStyle: TextStyle(color: Colors.white70)),
                    style: const TextStyle(color: Colors.white),
                    validator: (value) => value!.isEmpty
                        ? 'Please enter your license plate'
                        : null,
                  ),
                  TextFormField(
                    controller: _chargeAmountController,
                    decoration: const InputDecoration(
                      labelText: 'Charge Amount per Trip',
                      hintText: 'e.g., 50000',
                      labelStyle: TextStyle(color: Colors.white70),
                      hintStyle: TextStyle(color: Colors.white30),
                    ),
                    style: const TextStyle(color: Colors.white),
                    keyboardType: TextInputType.number,
                    validator: (value) => value!.isEmpty
                        ? 'Please enter your charge amount'
                        : null,
                  ),
                ],
              ),
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel'),
              onPressed: () {
                setState(() => _isDriverMode = false);
                Navigator.of(context).pop();
              },
            ),
            ElevatedButton(
              child: const Text('Continue'),
              onPressed: () async {
                // <-- Made this async
                if (_formKey.currentState!.validate()) {
                  // --- THIS IS THE NEW FIREBASE LOGIC ---
                  final user = FirebaseAuth.instance.currentUser;
                  if (user != null) {
                    // Save the truck details to a 'trucks' collection in Firestore
                    await FirebaseFirestore.instance
                        .collection('trucks')
                        .doc(user.uid)
                        .set({
                      'driverId': user.uid,
                      'driverName': widget.name,
                      'truckModel': _truckModelController.text.trim(),
                      'licensePlate': _licensePlateController.text.trim(),
                      'chargeAmount': double.tryParse(
                              _chargeAmountController.text.trim()) ??
                          0,
                      'isAvailable': true,
                      'lastUpdated': Timestamp.now(),
                    });
                    print('Driver details saved to Firebase!');
                    Navigator.of(context).pop();
                  }
                }
              },
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    // The rest of your build method remains the same...
    return SingleChildScrollView(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 20.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            SwitchListTile(
              title: const Text('Driver Mode',
                  style: TextStyle(
                      color: Colors.white, fontWeight: FontWeight.bold)),
              subtitle: Text(
                _isDriverMode
                    ? 'Your truck is now visible to customers'
                    : 'Turn on to make your truck available',
                style: const TextStyle(color: Colors.white70),
              ),
              value: _isDriverMode,
              onChanged: (bool value) {
                setState(() {
                  _isDriverMode = value;
                });
                if (_isDriverMode) {
                  _showAddTruckDialog(context);
                }
              },
              secondary: const Icon(Icons.local_shipping, color: Colors.white),
              activeThumbColor: Colors.cyan,
            ),
            const Divider(color: Colors.grey),
            const SizedBox(height: 30),
            Text('Welcome, ${widget.name}',
                style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    color: Colors.white)),
            const SizedBox(height: 40),
            const CircleAvatar(
                radius: 80,
                backgroundColor: Colors.black,
                child: Icon(Icons.fire_truck, color: Colors.white, size: 100)),
            const SizedBox(height: 40),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.grey[800],
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(30)),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 40, vertical: 16)),
              onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (context) => const TypesOfTrucksPage())),
              child: const Text('ORDER TRUCKS'),
            ),
            const SizedBox(height: 20),
            const Text("Let's roll!", style: TextStyle(color: Colors.white70)),
          ],
        ),
      ),
    );
  }
}
