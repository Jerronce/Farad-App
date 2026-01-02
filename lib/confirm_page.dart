import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'services/flutterwave_service.dart';
import 'home_screen.dart';

class ConfirmPage extends StatefulWidget {
  final double amount;
  final String driverName;
  final String pickupLocation;
  final String deliveryLocation;
  final String truckModel;

  const ConfirmPage({
    super.key,
    required this.amount,
    required this.driverName,
    required this.pickupLocation,
    required this.deliveryLocation,
    required this.truckModel,
  });

  @override
  State<ConfirmPage> createState() => _ConfirmPageState();
}

class _ConfirmPageState extends State<ConfirmPage> {
  final _formKey = GlobalKey<FormState>();
  bool _isProcessing = false;

  Future<void> _processPayment() async {
    if (_formKey.currentState!.validate()) {
      setState(() => _isProcessing = true);
      
      try {
        final user = FirebaseAuth.instance.currentUser;
        if (user != null) {
          // Create order document first
          final orderDoc = await FirebaseFirestore.instance
              .collection('orders')
              .add({
            'customerId': user.uid,
            'customerName': user.displayName ?? 'Customer',
            'driverId': '',
            'driverName': widget.driverName,
            'truckId': '',
            'truckModel': widget.truckModel,
            'pickupLocation': widget.pickupLocation,
            'deliveryLocation': widget.deliveryLocation,
            'amount': widget.amount,
            'paymentStatus': 'pending',
            'orderStatus': 'requested',
            'createdAt': FieldValue.serverTimestamp(),
          });

          // Process payment
          final success = await FlutterwaveService.processPayment(
            email: user.email ?? '',
            customerName: user.displayName ?? 'Customer',
            amount: widget.amount,
            orderId: orderDoc.id,
          );

          if (!mounted) return;

          if (success) {
            showDialog(
              context: context,
              barrierDismissible: false,
              builder: (ctx) => AlertDialog(
                backgroundColor: Colors.grey[800],
                title: const Text('Success!',
                    style: TextStyle(color: Colors.white)),
                content: const Text(
                  'Payment successful! Your order is confirmed.',
                  style: TextStyle(color: Colors.white70),
                ),
                actions: [
                  TextButton(
                    onPressed: () {
                      Navigator.of(context).pushAndRemoveUntil(
                        MaterialPageRoute(
                          builder: (context) => HomeScreen(
                            name: user.displayName ?? 'User',
                          ),
                        ),
                        (Route<dynamic> route) => false,
                      );
                    },
                    child: const Text('Done'),
                  )
                ],
              ),
            );
          } else {
            showDialog(
              context: context,
              builder: (ctx) => AlertDialog(
                backgroundColor: Colors.grey[800],
                title: const Text('Payment Failed',
                    style: TextStyle(color: Colors.white)),
                content: const Text(
                  'Your payment could not be processed. Please try again.',
                  style: TextStyle(color: Colors.white70),
                ),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.of(ctx).pop(),
                    child: const Text('Try Again'),
                  )
                ],
              ),
            );
          }
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error: $e')),
          );
        }
      } finally {
        setState(() => _isProcessing = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: SingleChildScrollView(
          child: Padding(
            padding: const EdgeInsets.all(16.0),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Chip(
                        label: Text('FARAD'),
                        backgroundColor: Colors.grey,
                      ),
                      TextButton(
                        onPressed: () => Navigator.of(context).pop(),
                        child: const Text('Back'),
                      ),
                      const Text('Confirm',
                          style: TextStyle(color: Colors.white)),
                    ],
                  ),
                  const SizedBox(height: 40),
                  Text(
                    'Amount: ₦${widget.amount.toStringAsFixed(2)}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 22,
                        fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    'Driver: ${widget.driverName}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.white70),
                  ),
                  const SizedBox(height: 30),
                  TextFormField(
                    style: const TextStyle(color: Colors.white),
                    decoration: InputDecoration(
                      labelText: 'Card Number',
                      labelStyle: const TextStyle(color: Colors.white70),
                      filled: true,
                      fillColor: Colors.grey[900],
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    keyboardType: TextInputType.number,
                    validator: (value) =>
                        value!.isEmpty ? 'Enter card number' : null,
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          style: const TextStyle(color: Colors.white),
                          decoration: InputDecoration(
                            labelText: 'MM/YY',
                            labelStyle: const TextStyle(color: Colors.white70),
                            filled: true,
                            fillColor: Colors.grey[900],
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          validator: (value) =>
                              value!.isEmpty ? 'Required' : null,
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: TextFormField(
                          style: const TextStyle(color: Colors.white),
                          decoration: InputDecoration(
                            labelText: 'CVV',
                            labelStyle: const TextStyle(color: Colors.white70),
                            filled: true,
                            fillColor: Colors.grey[900],
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          obscureText: true,
                          validator: (value) =>
                              value!.isEmpty ? 'Required' : null,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 40),
                  FilledButton(
                    onPressed: _isProcessing ? null : _processPayment,
                    child: _isProcessing
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                            ),
                          )
                        : const Text('Complete Payment'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
