// lib/orders_screen.dart - FINAL LIVE VERSION

import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

// First, let's create a data model for a single order
class Order {
  final String orderId;
  final String trucks;
  final String goodsType;
  final String location;
  final Timestamp date;
  final String status;

  Order({
    required this.orderId,
    required this.trucks,
    required this.goodsType,
    required this.location,
    required this.date,
    required this.status,
  });

  // This is a factory constructor that creates an Order from a Firestore document
  factory Order.fromFirestore(DocumentSnapshot doc) {
    Map data = doc.data() as Map<String, dynamic>;
    return Order(
      orderId: doc.id,
      trucks: data['trucks'] ?? 'N/A',
      goodsType: data['goodsType'] ?? 'N/A',
      location: data['location'] ?? 'N/A',
      date: data['createdAt'] ?? Timestamp.now(),
      status: data['status'] ?? 'Processing',
    );
  }
}

class OrdersScreen extends StatefulWidget {
  final String name;
  const OrdersScreen({super.key, required this.name});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  // This function fetches real orders from the database for the current user
  Future<List<Order>> _fetchUserOrders() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      return []; // Return empty list if no user is logged in
    }

    // Get the documents from the 'orders' collection where the 'userId' matches the current user
    final snapshot = await FirebaseFirestore.instance
        .collection('orders')
        .where('userId', isEqualTo: user.uid)
        .orderBy('createdAt', descending: true) // Show the newest orders first
        .get();

    // Convert the documents into a list of Order objects
    return snapshot.docs.map((doc) => Order.fromFirestore(doc)).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Your Past Orders',
            style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 20),

          // FutureBuilder is the perfect widget for handling data that needs to be loaded.
          Expanded(
            child: FutureBuilder<List<Order>>(
              future: _fetchUserOrders(),
              builder: (context, snapshot) {
                // 1. While the data is loading, show a spinner
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                // 2. If there was an error loading the data
                if (snapshot.hasError) {
                  return const Center(child: Text('Failed to load orders.', style: TextStyle(color: Colors.red)));
                }
                // 3. If the data loaded, but the list is empty
                if (!snapshot.hasData || snapshot.data!.isEmpty) {
                  return const Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.receipt_long_outlined, color: Colors.grey, size: 80),
                        SizedBox(height: 20),
                        Text(
                          'No Orders Yet',
                          style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                        ),
                        SizedBox(height: 8),
                        Text(
                          'Your confirmed orders will appear here.',
                          style: TextStyle(color: Colors.white70),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  );
                }

                // 4. If we have data, build the list of orders
                final orders = snapshot.data!;
                return ListView.builder(
                  itemCount: orders.length,
                  itemBuilder: (context, index) {
                    final order = orders[index];
                    return Card(
                      color: Colors.grey[900],
                      margin: const EdgeInsets.symmetric(vertical: 8.0),
                      child: Padding(
                        padding: const EdgeInsets.all(16.0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text('Order #${order.orderId.substring(0, 6)}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                                Text(
                                  // A simple way to format the date
                                    '${order.date.toDate().day}/${order.date.toDate().month}/${order.date.toDate().year}',
                                    style: const TextStyle(color: Colors.white70, fontSize: 12)
                                ),
                              ],
                            ),
                            const Divider(color: Colors.grey),
                            const SizedBox(height: 8),
                            Text('Trucks: ${order.trucks}', style: const TextStyle(color: Colors.white70)),
                            const SizedBox(height: 4),
                            Text('Goods: ${order.goodsType}', style: const TextStyle(color: Colors.white70)),
                            const SizedBox(height: 4),
                            Text('Location: ${order.location}', style: const TextStyle(color: Colors.white70)),
                            const SizedBox(height: 12),
                            Align(
                              alignment: Alignment.centerRight,
                              child: Chip(
                                label: Text(order.status),
                                backgroundColor: order.status == 'Delivered' ? Colors.green : Colors.orange,
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
