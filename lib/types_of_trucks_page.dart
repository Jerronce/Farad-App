// lib/types_of_trucks_page.dart - FINAL CORRECTED VERSION

import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'select_heavy_goods_page.dart'; // Using a direct, relative import

// Data model for a Truck
class Truck {
  final String id;
  final String name;
  final bool isAvailable;
  bool isSelected;

  Truck({
    required this.id,
    required this.name,
    required this.isAvailable,
    this.isSelected = false,
  });

  // Factory constructor to create a Truck from a Firestore document
  factory Truck.fromFirestore(DocumentSnapshot doc) {
    Map data = doc.data() as Map<String, dynamic>;
    return Truck(
      id: doc.id,
      name: data['truckModel'] ?? 'Unknown Model',
      isAvailable: data['isAvailable'] ?? false,
    );
  }
}

class TypesOfTrucksPage extends StatefulWidget {
  const TypesOfTrucksPage({super.key});

  @override
  State<TypesOfTrucksPage> createState() => _TypesOfTrucksPageState();
}

class _TypesOfTrucksPageState extends State<TypesOfTrucksPage> {
  final List<Truck> _selectedTrucks = [];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // -- Custom Header --
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back, color: Colors.white),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                  const Text('TYPES OF TRUCKS',
                      style: TextStyle(color: Colors.white)),
                ],
              ),
              const SizedBox(height: 20),

              // -- Location Filter Fields --
              TextField(
                decoration: InputDecoration(
                    hintText: 'Enter Country',
                    filled: true,
                    fillColor: Colors.grey[800],
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(30),
                        borderSide: BorderSide.none)),
              ),
              const SizedBox(height: 16),
              TextField(
                decoration: InputDecoration(
                    hintText: 'Enter State',
                    filled: true,
                    fillColor: Colors.grey[800],
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(30),
                        borderSide: BorderSide.none)),
              ),
              const SizedBox(height: 20),

              // -- The List of Trucks (or Empty State) --
              Expanded(
                child: StreamBuilder<QuerySnapshot>(
                  stream: FirebaseFirestore.instance
                      .collection('trucks')
                      .snapshots(),
                  builder: (context, snapshot) {
                    if (snapshot.connectionState == ConnectionState.waiting) {
                      return const Center(child: CircularProgressIndicator());
                    }
                    if (snapshot.hasError) {
                      return const Center(
                          child: Text('Failed to load trucks.',
                              style: TextStyle(color: Colors.red)));
                    }
                    if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
                      return const Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.local_shipping_outlined,
                                color: Colors.grey, size: 80),
                            SizedBox(height: 20),
                            Text('No Trucks Available Yet',
                                style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 18,
                                    fontWeight: FontWeight.bold)),
                            SizedBox(height: 8),
                            Text(
                                'Check back later or try a different location.',
                                style: TextStyle(color: Colors.white70),
                                textAlign: TextAlign.center),
                          ],
                        ),
                      );
                    }

                    final trucks = snapshot.data!.docs
                        .map((doc) => Truck.fromFirestore(doc))
                        .toList();

                    return ListView.builder(
                      itemCount: trucks.length,
                      itemBuilder: (context, index) {
                        final truck = trucks[index];
                        return ListTile(
                          title: Text(truck.name,
                              style: TextStyle(
                                  color: truck.isAvailable
                                      ? Colors.cyan
                                      : Colors.red)),
                          trailing: Switch(
                            value: truck.isSelected,
                            onChanged: truck.isAvailable
                                ? (value) {
                                    setState(() {
                                      truck.isSelected = value;
                                      if (value) {
                                        _selectedTrucks.add(truck);
                                      } else {
                                        _selectedTrucks.removeWhere(
                                            (t) => t.id == truck.id);
                                      }
                                    });
                                  }
                                : null,
                          ),
                        );
                      },
                    );
                  },
                ),
              ),
              const SizedBox(height: 20),

              // -- CONFIRM Button --
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.grey[600],
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                ),
                onPressed: () {
                  print(
                      'Selected trucks: ${_selectedTrucks.map((t) => t.name).toList()}');
                  Navigator.push(
                      context,
                      MaterialPageRoute(
                          builder: (context) => const SelectHeavyGoodsPage()));
                },
                child: const Text('CONFIRM'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
