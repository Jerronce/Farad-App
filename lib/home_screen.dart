import 'package:flutter/material.dart';
import 'types_of_trucks_page.dart';
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
                    'Provide vehicle details to become available.',
                    style: TextStyle(color: Colors.white70),
                  ),
                  const SizedBox(height: 20),
                  TextFormField(
                    controller: _truckModelController,
                    decoration: InputDecoration(
                      labelText: 'Truck Model (e.g., DAF CF)',
                      labelStyle: const TextStyle(color: Colors.white70),
                      filled: true,
                      fillColor: Colors.grey[800],
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    style: const TextStyle(color: Colors.white),
                    validator: (value) =>
                        value!.isEmpty ? 'Enter truck model' : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _licensePlateController,
                    decoration: InputDecoration(
                      labelText: 'License Plate',
                      labelStyle: const TextStyle(color: Colors.white70),
                      filled: true,
                      fillColor: Colors.grey[800],
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    style: const TextStyle(color: Colors.white),
                    validator: (value) =>
                        value!.isEmpty ? 'Enter license plate' : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _chargeAmountController,
                    decoration: InputDecoration(
                      labelText: 'Charge per Trip (₦)',
                      hintText: 'e.g., 50000',
                      labelStyle: const TextStyle(color: Colors.white70),
                      filled: true,
                      fillColor: Colors.grey[800],
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    style: const TextStyle(color: Colors.white),
                    keyboardType: TextInputType.number,
                    validator: (value) =>
                        value!.isEmpty ? 'Enter amount' : null,
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
                if (_formKey.currentState!.validate()) {
                  final user = FirebaseAuth.instance.currentUser;
                  if (user != null) {
                    await FirebaseFirestore.instance
                        .collection('trucks')
                        .doc(user.uid)
                        .set({
                      'driverId': user.uid,
                      'driverName': widget.name,
                      'truckModel': _truckModelController.text.trim(),
                      'licensePlate': _licensePlateController.text.trim(),
                      'chargeAmount':
                          double.tryParse(_chargeAmountController.text) ?? 0,
                      'isAvailable': true,
                      'rating': 0.0,
                      'lastUpdated': FieldValue.serverTimestamp(),
                    });

                    if (mounted) {
                      Navigator.of(context).pop();
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Truck registered! Now accepting orders.'),
                        ),
                      );
                    }
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
                    ? 'Your truck is visible to customers'
                    : 'Turn on to accept orders',
                style: const TextStyle(color: Colors.white70),
              ),
              value: _isDriverMode,
              onChanged: (bool value) {
                setState(() => _isDriverMode = value);
                if (_isDriverMode) {
                  _showAddTruckDialog(context);
                }
              },
              secondary:
                  const Icon(Icons.local_shipping, color: Colors.cyan),
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
            Container(
              width: 160,
              height: 160,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.grey[900],
              ),
              child: const Icon(Icons.fire_truck,
                  color: Colors.cyan, size: 100),
            ),
            const SizedBox(height: 40),
            FilledButton.tonal(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => const TypesOfTrucksPage(),
                ),
              ),
              child: const Padding(
                padding: EdgeInsets.symmetric(horizontal: 40, vertical: 16),
                child: Text('ORDER TRUCKS'),
              ),
            ),
            const SizedBox(height: 20),
            const Text("Let's roll!",
                style: TextStyle(color: Colors.white70)),
          ],
        ),
      ),
    );
  }
}
