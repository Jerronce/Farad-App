// lib/confirm_page.dart - FINAL LIVE VERSION

import 'package:flutter/material.dart';
import 'package:farad_app/main_page.dart'; // To navigate back to the main app

class ConfirmPage extends StatefulWidget {
  const ConfirmPage({super.key});

  @override
  State<ConfirmPage> createState() => _ConfirmPageState();
}

class _ConfirmPageState extends State<ConfirmPage> {
  // A GlobalKey for our form to handle validation
  final _formKey = GlobalKey<FormState>();

  // This function simulates the payment process
  void _processPayment() {
    // First, check if the card details form is valid
    if (_formKey.currentState!.validate()) {
      // --- This is where the magic happens ---
      // In a real app, you would call a payment gateway (like Paystack) here.
      // For now, we will just pretend. We'll create a "random" success or failure.
      bool paymentWasSuccessful = DateTime.now().second % 2 == 0; // 50% chance of success

      if (paymentWasSuccessful) {
        // Show the "Congratulations" pop-up
        showDialog(
          context: context,
          barrierDismissible: false, // User must tap button to close
          builder: (ctx) => AlertDialog(
            backgroundColor: Colors.grey[800],
            title: const Text('Congratulations!', style: TextStyle(color: Colors.white)),
            content: const Text('Your payment was successful and your order is confirmed.', style: TextStyle(color: Colors.white70)),
            actions: [
              TextButton(
                onPressed: () {
                  // Navigate all the way back to the main screen, clearing the history
                  Navigator.of(context).pushAndRemoveUntil(
                    MaterialPageRoute(builder: (context) => const MainPage(name: "Jerry")), // We need to pass a name back
                        (Route<dynamic> route) => false,
                  );
                },
                child: const Text('Done'),
              )
            ],
          ),
        );
      } else {
        // Show the "Payment Failed" pop-up
        showDialog(
          context: context,
          builder: (ctx) => AlertDialog(
            backgroundColor: Colors.grey[800],
            title: const Text('Payment Failed', style: TextStyle(color: Colors.white)),
            content: const Text('There were insufficient funds in your account. Please try another card or payment method.', style: TextStyle(color: Colors.white70)),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(), // Just close the dialog
                child: const Text('Try Again'),
              )
            ],
          ),
        );
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
                  // -- Custom Header --
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Chip(label: Text('FARAD'), backgroundColor: Colors.grey),
                      TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Back')),
                      const Text('Confirm', style: TextStyle(color: Colors.white)),
                    ],
                  ),
                  const SizedBox(height: 40),
                  const Text('This will be charged from your account', textAlign: TextAlign.center, style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 30),

                  // --- Card Details Form ---
                  TextFormField(
                    style: const TextStyle(color: Colors.white),
                    decoration: InputDecoration(labelText: 'Card Number', labelStyle: const TextStyle(color: Colors.white70), filled: true, fillColor: Colors.grey[900], border: OutlineInputBorder(borderRadius: BorderRadius.circular(12))),
                    keyboardType: TextInputType.number,
                    validator: (value) => value!.isEmpty ? 'Please enter a card number' : null,
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          style: const TextStyle(color: Colors.white),
                          decoration: InputDecoration(labelText: 'Expiry Date (MM/YY)', labelStyle: const TextStyle(color: Colors.white70), filled: true, fillColor: Colors.grey[900], border: OutlineInputBorder(borderRadius: BorderRadius.circular(12))),
                          keyboardType: TextInputType.datetime,
                          validator: (value) => value!.isEmpty ? 'Please enter an expiry date' : null,
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: TextFormField(
                          style: const TextStyle(color: Colors.white),
                          decoration: InputDecoration(labelText: 'CVV', labelStyle: const TextStyle(color: Colors.white70), filled: true, fillColor: Colors.grey[900], border: OutlineInputBorder(borderRadius: BorderRadius.circular(12))),
                          keyboardType: TextInputType.number,
                          validator: (value) => value!.isEmpty ? 'Please enter a CVV' : null,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  const Text('Accepted Cards: Mastercard, Visa, Verve, JCB, AmEx', style: TextStyle(color: Colors.white70, fontSize: 12), textAlign: TextAlign.center),

                  const SizedBox(height: 40),
                  const Divider(color: Colors.grey),
                  const Center(child: Text('OR PAY WITH', style: TextStyle(color: Colors.white70))),
                  const Divider(color: Colors.grey),
                  const SizedBox(height: 20),

                  // --- Other Payment Options ---
                  ElevatedButton(onPressed: () {}, child: const Text('Pay with OPay')),
                  const SizedBox(height: 12),
                  ElevatedButton(onPressed: () {}, child: const Text('Pay with PayPal')),
                  const SizedBox(height: 12),
                  ElevatedButton(onPressed: () {}, child: const Text('Pay with Kuda')),

                  const SizedBox(height: 40),

                  // --- Confirm Button ---
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(backgroundColor: Colors.grey[800], foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 16), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(30))),
                    onPressed: _processPayment, // This now calls our smart payment function
                    child: const Text('Confirm'),
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
