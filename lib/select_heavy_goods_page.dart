// lib/select_heavy_goods_page.dart - FINAL VERSION

import 'package:flutter/material.dart';
import 'package:farad_app/confirm_page.dart'; // Import the final confirm page

class SelectHeavyGoodsPage extends StatelessWidget {
  const SelectHeavyGoodsPage({super.key});

  @override
  Widget build(BuildContext context) {
    // A helper function to avoid repeating navigation code
    void navigateToConfirmPage() {
      Navigator.push(context,
          MaterialPageRoute(builder: (context) => const ConfirmPage()));
    }

    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            children: [
              // -- Custom Header --
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Chip(
                      label: Text('FARAD'), backgroundColor: Colors.grey),
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('Back'),
                  ),
                  const Text('SELECT', style: TextStyle(color: Colors.white)),
                ],
              ),
              const SizedBox(height: 60),

              // -- Info Text --
              const Text(
                'Select from Heavy goods or Building materials you wish',
                style: TextStyle(color: Colors.white70, fontSize: 16),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 10),
              const Text(
                'Click here to proceed',
                style: TextStyle(color: Colors.white70),
              ),
              const Icon(Icons.arrow_downward, color: Colors.white),
              const SizedBox(height: 30),

              // -- The Two Choices --
              Row(
                children: [
                  // This Expanded widget makes each choice take up half the screen width
                  Expanded(
                    child: Column(
                      children: [
                        // As requested, a large icon to represent Heavy Goods
                        const Icon(Icons.inventory_2_outlined,
                            color: Colors.white, size: 120),
                        const SizedBox(height: 20),
                        ElevatedButton(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.grey[800],
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(30)),
                          ),
                          onPressed:
                              navigateToConfirmPage, // Navigates to the confirm page
                          child: const Text('HEAVY GOODS'),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 20), // Space between the two columns

                  // This Expanded widget makes the second choice take up the other half
                  Expanded(
                    child: Column(
                      children: [
                        // As requested, a large icon to represent Building Materials
                        const Icon(Icons.construction_outlined,
                            color: Colors.white, size: 120),
                        const SizedBox(height: 20),
                        ElevatedButton(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.grey[800],
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(30)),
                          ),
                          onPressed:
                              navigateToConfirmPage, // Also navigates to the confirm page
                          child: const Text('BUILDING MATERIALS'),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
