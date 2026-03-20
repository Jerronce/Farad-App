import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

import 'firebase_options.dart';

const String kAdminEmail = 'jerronce101@gmail.com';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  runApp(const FaradApp());
}

class FaradApp extends StatelessWidget {
  const FaradApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Farad Logistics',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF0F766E),
          secondary: const Color(0xFFF97316),
        ),
        scaffoldBackgroundColor: const Color(0xFFF6F8FB),
      ),
      home: const AuthGate(),
    );
  }
}

enum AppMode { customer, driver }

enum PaymentMethod { card, wallet, transfer, cash }

extension PaymentMethodX on PaymentMethod {
  String get label {
    switch (this) {
      case PaymentMethod.card:
        return 'Visa / Mastercard';
      case PaymentMethod.wallet:
        return 'Wallet';
      case PaymentMethod.transfer:
        return 'Bank Transfer';
      case PaymentMethod.cash:
        return 'Cash on Delivery';
    }
  }

  String get dbValue {
    switch (this) {
      case PaymentMethod.card:
        return 'card';
      case PaymentMethod.wallet:
        return 'wallet';
      case PaymentMethod.transfer:
        return 'transfer';
      case PaymentMethod.cash:
        return 'cash';
    }
  }
}

class DriverProfile {
  const DriverProfile({
    required this.uid,
    required this.displayName,
    required this.phone,
    required this.vehicleType,
    required this.truckModel,
    required this.licensePlate,
    required this.baseFare,
    required this.feePerKm,
    required this.isLive,
    required this.isAvailable,
    required this.rating,
  });

  final String uid;
  final String displayName;
  final String phone;
  final String vehicleType;
  final String truckModel;
  final String licensePlate;
  final double baseFare;
  final double feePerKm;
  final bool isLive;
  final bool isAvailable;
  final double rating;

  factory DriverProfile.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final Map<String, dynamic> data = doc.data() ?? <String, dynamic>{};
    return DriverProfile(
      uid: doc.id,
      displayName: (data['displayName'] ?? 'Farad Driver').toString(),
      phone: (data['phone'] ?? '').toString(),
      vehicleType: (data['vehicleType'] ?? 'Cargo Van').toString(),
      truckModel: (data['truckModel'] ?? '').toString(),
      licensePlate: (data['licensePlate'] ?? '').toString(),
      baseFare: ((data['baseFare'] ?? 3000) as num).toDouble(),
      feePerKm: ((data['feePerKm'] ?? 500) as num).toDouble(),
      isLive: data['isLive'] == true,
      isAvailable: data['isAvailable'] != false,
      rating: ((data['rating'] ?? 4.8) as num).toDouble(),
    );
  }
}

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (BuildContext context, AsyncSnapshot<User?> snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        if (!snapshot.hasData) {
          return const AuthScreen();
        }
        return WorkspaceShell(user: snapshot.data!);
      },
    );
  }
}

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _name = TextEditingController();
  final TextEditingController _email = TextEditingController();
  final TextEditingController _password = TextEditingController();
  bool _login = true;
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }
    setState(() => _busy = true);
    try {
      final FirebaseAuth auth = FirebaseAuth.instance;
      final String email = _email.text.trim().toLowerCase();
      if (_login) {
        await auth.signInWithEmailAndPassword(
          email: email,
          password: _password.text.trim(),
        );
      } else {
        final UserCredential credential = await auth.createUserWithEmailAndPassword(
          email: email,
          password: _password.text.trim(),
        );
        await credential.user?.updateDisplayName(_name.text.trim());
        await FirebaseFirestore.instance.collection('users').doc(credential.user!.uid).set(
          <String, dynamic>{
            'uid': credential.user!.uid,
            'email': email,
            'displayName': _name.text.trim(),
            'isAdmin': email == kAdminEmail,
            'preferredMode': AppMode.customer.name,
            'createdAt': FieldValue.serverTimestamp(),
            'updatedAt': FieldValue.serverTimestamp(),
          },
          SetOptions(merge: true),
        );
      }
    } on FirebaseAuthException catch (error) {
      _message(error.message ?? 'Authentication failed.');
    } catch (error) {
      _message('Authentication failed: $error');
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  void _message(String text) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  @override
  Widget build(BuildContext context) {
    final bool wide = MediaQuery.of(context).size.width > 880;
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: <Color>[Color(0xFFF4FBF8), Color(0xFFFFF0E4), Color(0xFFF7F8FC)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1100),
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: wide
                    ? Row(
                        children: <Widget>[
                          Expanded(child: _hero()),
                          const SizedBox(width: 24),
                          SizedBox(width: 420, child: _card()),
                        ],
                      )
                    : ListView(
                        shrinkWrap: true,
                        children: <Widget>[_hero(), const SizedBox(height: 20), _card()],
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _hero() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: const <Widget>[
            Chip(label: Text('Farad Interactive')),
            SizedBox(height: 16),
            Text(
              'Interactive pickup and driver logistics.',
              style: TextStyle(fontSize: 34, fontWeight: FontWeight.w800, height: 1.1),
            ),
            SizedBox(height: 12),
            Text(
              'Customers can sign up, log in, choose payment, request deliveries, and track status. Drivers can switch mode, onboard with their pricing, and accept jobs live.',
              style: TextStyle(height: 1.6),
            ),
          ],
        ),
      ),
    );
  }

  Widget _card() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                _login ? 'Login' : 'Sign Up',
                style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 18),
              if (!_login) ...<Widget>[
                TextFormField(
                  controller: _name,
                  decoration: const InputDecoration(labelText: 'Full name'),
                  validator: (String? value) => value == null || value.trim().length < 2 ? 'Enter your name' : null,
                ),
                const SizedBox(height: 12),
              ],
              TextFormField(
                controller: _email,
                decoration: const InputDecoration(labelText: 'Email'),
                validator: (String? value) => value == null || !value.contains('@') ? 'Enter a valid email' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _password,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Password'),
                validator: (String? value) => value == null || value.trim().length < 6 ? 'Min 6 characters' : null,
              ),
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _busy ? null : _submit,
                  child: _busy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(_login ? 'Login' : 'Create account'),
                ),
              ),
              TextButton(
                onPressed: _busy ? null : () => setState(() => _login = !_login),
                child: Text(_login ? 'Need an account? Sign up' : 'Already have an account? Login'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class WorkspaceShell extends StatefulWidget {
  const WorkspaceShell({super.key, required this.user});

  final User user;

  @override
  State<WorkspaceShell> createState() => _WorkspaceShellState();
}

class _WorkspaceShellState extends State<WorkspaceShell> {
  AppMode _mode = AppMode.customer;
  bool _modeLoaded = false;
  bool _dialogOpen = false;

  @override
  void initState() {
    super.initState();
    unawaited(_ensureUserDoc());
  }

  Future<void> _ensureUserDoc() async {
    final User user = widget.user;
    await FirebaseFirestore.instance.collection('users').doc(user.uid).set(
      <String, dynamic>{
        'uid': user.uid,
        'email': (user.email ?? '').toLowerCase(),
        'displayName': user.displayName ?? 'Farad User',
        'isAdmin': (user.email ?? '').toLowerCase() == kAdminEmail,
        'preferredMode': _mode.name,
        'updatedAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );
  }

  Future<void> _setMode(AppMode mode) async {
    setState(() => _mode = mode);
    await FirebaseFirestore.instance.collection('users').doc(widget.user.uid).set(
      <String, dynamic>{
        'preferredMode': mode.name,
        'updatedAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );
  }

  Future<void> _openDriverDialog() async {
    if (_dialogOpen) {
      return;
    }
    _dialogOpen = true;
    final Map<String, dynamic>? payload = await showDialog<Map<String, dynamic>>(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext context) => DriverSetupDialog(
        defaultName: widget.user.displayName ?? 'Farad Driver',
        email: widget.user.email ?? '',
      ),
    );
    _dialogOpen = false;
    if (payload == null) {
      await _setMode(AppMode.customer);
      return;
    }
    await FirebaseFirestore.instance.collection('drivers').doc(widget.user.uid).set(
      <String, dynamic>{
        'uid': widget.user.uid,
        'email': (widget.user.email ?? '').toLowerCase(),
        'displayName': payload['displayName'],
        'phone': payload['phone'],
        'vehicleType': payload['vehicleType'],
        'truckModel': payload['truckModel'],
        'licensePlate': payload['licensePlate'],
        'baseFare': payload['baseFare'],
        'feePerKm': payload['feePerKm'],
        'isLive': true,
        'isAvailable': true,
        'rating': 4.8,
        'updatedAt': FieldValue.serverTimestamp(),
        'createdAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance.collection('users').doc(widget.user.uid).snapshots(),
      builder: (BuildContext context, AsyncSnapshot<DocumentSnapshot<Map<String, dynamic>>> userSnapshot) {
        final Map<String, dynamic> userData = userSnapshot.data?.data() ?? <String, dynamic>{};
        if (!_modeLoaded) {
          _mode = (userData['preferredMode'] ?? AppMode.customer.name) == AppMode.driver.name
              ? AppMode.driver
              : AppMode.customer;
          _modeLoaded = true;
        }
        final bool isAdmin = ((widget.user.email ?? '').toLowerCase() == kAdminEmail) || userData['isAdmin'] == true;
        return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
          stream: FirebaseFirestore.instance.collection('drivers').doc(widget.user.uid).snapshots(),
          builder: (BuildContext context, AsyncSnapshot<DocumentSnapshot<Map<String, dynamic>>> driverSnapshot) {
            if (_mode == AppMode.driver && !(driverSnapshot.data?.exists ?? false)) {
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (mounted && !_dialogOpen) {
                  unawaited(_openDriverDialog());
                }
              });
            }
            return Scaffold(
              appBar: AppBar(
                title: const Text('Farad Logistics'),
                actions: <Widget>[
                  if (isAdmin) const Padding(
                    padding: EdgeInsets.only(right: 8),
                    child: Chip(label: Text('Admin')),
                  ),
                  IconButton(
                    onPressed: () => FirebaseAuth.instance.signOut(),
                    icon: const Icon(Icons.logout),
                  ),
                ],
              ),
              body: SafeArea(
                child: ListView(
                  padding: const EdgeInsets.all(18),
                  children: <Widget>[
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(18),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Text(
                              'Welcome ${userData['displayName'] ?? widget.user.displayName ?? 'Farad User'}',
                              style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800),
                            ),
                            const SizedBox(height: 6),
                            Text(widget.user.email ?? ''),
                            const SizedBox(height: 12),
                            SegmentedButton<AppMode>(
                              segments: const <ButtonSegment<AppMode>>[
                                ButtonSegment(value: AppMode.customer, label: Text('Pickup')),
                                ButtonSegment(value: AppMode.driver, label: Text('Driver Mode')),
                              ],
                              selected: <AppMode>{_mode},
                              onSelectionChanged: (Set<AppMode> values) => _setMode(values.first),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 18),
                    if (isAdmin) const AdminSnapshot(),
                    if (isAdmin) const SizedBox(height: 18),
                    if (_mode == AppMode.customer)
                      CustomerPanel(user: widget.user, displayName: (userData['displayName'] ?? '').toString())
                    else
                      DriverPanel(
                        user: widget.user,
                        driver: driverSnapshot.data?.exists == true ? DriverProfile.fromDoc(driverSnapshot.data!) : null,
                        onEdit: _openDriverDialog,
                      ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }
}

class CustomerPanel extends StatefulWidget {
  const CustomerPanel({super.key, required this.user, required this.displayName});

  final User user;
  final String displayName;

  @override
  State<CustomerPanel> createState() => _CustomerPanelState();
}

class _CustomerPanelState extends State<CustomerPanel> {
  final TextEditingController _name = TextEditingController();
  final TextEditingController _phone = TextEditingController();
  final TextEditingController _pickup = TextEditingController();
  final TextEditingController _dropoff = TextEditingController();
  final TextEditingController _package = TextEditingController();
  final TextEditingController _cardHolder = TextEditingController();
  final TextEditingController _cardNumber = TextEditingController();
  final TextEditingController _cardExpiry = TextEditingController();
  final TextEditingController _wallet = TextEditingController();
  final TextEditingController _transfer = TextEditingController();

  int _step = 0;
  double _distanceKm = 8;
  PaymentMethod _paymentMethod = PaymentMethod.card;
  String? _selectedDriverId;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _name.text = widget.displayName.isEmpty ? 'Farad Customer' : widget.displayName;
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _pickup.dispose();
    _dropoff.dispose();
    _package.dispose();
    _cardHolder.dispose();
    _cardNumber.dispose();
    _cardExpiry.dispose();
    _wallet.dispose();
    _transfer.dispose();
    super.dispose();
  }

  bool get _routeReady =>
      _pickup.text.trim().isNotEmpty &&
      _dropoff.text.trim().isNotEmpty &&
      _phone.text.trim().isNotEmpty;

  bool get _paymentReady {
    switch (_paymentMethod) {
      case PaymentMethod.card:
        return _cardHolder.text.trim().isNotEmpty &&
            _cardNumber.text.trim().replaceAll(' ', '').length >= 12 &&
            _cardExpiry.text.trim().isNotEmpty;
      case PaymentMethod.wallet:
        return _wallet.text.trim().isNotEmpty;
      case PaymentMethod.transfer:
        return _transfer.text.trim().isNotEmpty;
      case PaymentMethod.cash:
        return true;
    }
  }

  double _fare(DriverProfile driver) => driver.baseFare + (_distanceKm * driver.feePerKm);

  String _last4(String value) {
    final String cleaned = value.replaceAll(' ', '');
    return cleaned.length < 4 ? cleaned : cleaned.substring(cleaned.length - 4);
  }

  Future<void> _book(DriverProfile driver) async {
    if (!_paymentReady) {
      _message('Complete the payment section first.');
      return;
    }
    setState(() => _saving = true);
    try {
      await FirebaseFirestore.instance.collection('orders').add(
        <String, dynamic>{
          'customerId': widget.user.uid,
          'customerEmail': (widget.user.email ?? '').toLowerCase(),
          'customerName': _name.text.trim(),
          'customerPhone': _phone.text.trim(),
          'pickupLocation': _pickup.text.trim(),
          'deliveryLocation': _dropoff.text.trim(),
          'packageDetails': _package.text.trim(),
          'distanceKm': _distanceKm,
          'estimatedFare': _fare(driver),
          'currency': 'NGN',
          'status': 'pending_driver',
          'paymentMethod': _paymentMethod.dbValue,
          'paymentLabel': _paymentMethod.label,
          'paymentStatus': _paymentMethod == PaymentMethod.cash ? 'pay_on_delivery' : 'payment_selected',
          'paymentDetails': <String, dynamic>{
            'cardHolder': _cardHolder.text.trim(),
            'cardLast4': _last4(_cardNumber.text.trim()),
            'cardExpiry': _cardExpiry.text.trim(),
            'walletId': _wallet.text.trim(),
            'transferReference': _transfer.text.trim(),
          },
          'chosenDriverId': driver.uid,
          'chosenDriverName': driver.displayName,
          'driverPhone': driver.phone,
          'driverVehicleType': driver.vehicleType,
          'driverTruckModel': driver.truckModel,
          'createdAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
        },
      );
      _message('Request sent to ${driver.displayName}.');
      _phone.clear();
      _pickup.clear();
      _dropoff.clear();
      _package.clear();
      _cardHolder.clear();
      _cardNumber.clear();
      _cardExpiry.clear();
      _wallet.clear();
      _transfer.clear();
      setState(() {
        _step = 0;
        _selectedDriverId = null;
        _paymentMethod = PaymentMethod.card;
        _distanceKm = 8;
      });
    } catch (error) {
      _message('Failed to save order: $error');
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  void _message(String text) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance.collection('drivers').where('isLive', isEqualTo: true).snapshots(),
      builder: (BuildContext context, AsyncSnapshot<QuerySnapshot<Map<String, dynamic>>> snapshot) {
        final List<DriverProfile> drivers = snapshot.data?.docs
                .map((QueryDocumentSnapshot<Map<String, dynamic>> doc) => DriverProfile.fromDoc(doc))
                .where((DriverProfile driver) => driver.isAvailable)
                .toList() ??
            <DriverProfile>[];
        final DriverProfile? selectedDriver = drivers.cast<DriverProfile?>().firstWhere(
              (DriverProfile? driver) => driver?.uid == _selectedDriverId,
              orElse: () => null,
            );
        return Column(
          children: <Widget>[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    const Text(
                      'Pickup flow',
                      style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: List<Widget>.generate(3, (int index) {
                        final bool active = _step == index;
                        return Chip(
                          backgroundColor: active ? const Color(0xFF0F766E) : const Color(0xFFEFF2F6),
                          labelStyle: TextStyle(color: active ? Colors.white : Colors.black87),
                          label: Text(<String>['Route', 'Driver', 'Payment'][index]),
                        );
                      }),
                    ),
                    const SizedBox(height: 16),
                    if (_step == 0) _routeStep(),
                    if (_step == 1) _driverStep(drivers, selectedDriver),
                    if (_step == 2) _paymentStep(selectedDriver),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 18),
            CustomerOrders(userId: widget.user.uid),
          ],
        );
      },
    );
  }

  Widget _routeStep() {
    return Column(
      children: <Widget>[
        TextField(controller: _name, decoration: const InputDecoration(labelText: 'Customer name')),
        const SizedBox(height: 12),
        TextField(controller: _phone, decoration: const InputDecoration(labelText: 'Phone number')),
        const SizedBox(height: 12),
        TextField(controller: _pickup, decoration: const InputDecoration(labelText: 'Pickup location')),
        const SizedBox(height: 12),
        TextField(controller: _dropoff, decoration: const InputDecoration(labelText: 'Delivery location')),
        const SizedBox(height: 12),
        TextField(
          controller: _package,
          maxLines: 2,
          decoration: const InputDecoration(labelText: 'Package details'),
        ),
        const SizedBox(height: 12),
        Card(
          color: const Color(0xFFF4FBF8),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text('Distance: ${_distanceKm.toStringAsFixed(1)} km'),
                Slider(
                  value: _distanceKm,
                  min: 1,
                  max: 60,
                  divisions: 59,
                  onChanged: (double value) => setState(() => _distanceKm = value),
                ),
              ],
            ),
          ),
        ),
        Align(
          alignment: Alignment.centerRight,
          child: FilledButton(
            onPressed: _routeReady ? () => setState(() => _step = 1) : null,
            child: const Text('Next'),
          ),
        ),
      ],
    );
  }

  Widget _driverStep(List<DriverProfile> drivers, DriverProfile? selectedDriver) {
    return Column(
      children: <Widget>[
        if (drivers.isEmpty)
          const Padding(
            padding: EdgeInsets.only(bottom: 16),
            child: Text('No driver is live yet. Once a driver goes live, they will show here with price.'),
          ),
        ...drivers.map((DriverProfile driver) {
          final bool selected = driver.uid == _selectedDriverId;
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: InkWell(
              onTap: () => setState(() => _selectedDriverId = driver.uid),
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: selected ? const Color(0xFFECFDF5) : Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: selected ? const Color(0xFF0F766E) : const Color(0xFFD0D5DD),
                    width: selected ? 2 : 1,
                  ),
                ),
                child: Row(
                  children: <Widget>[
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(driver.displayName, style: const TextStyle(fontWeight: FontWeight.w700)),
                          Text('${driver.vehicleType} • ${driver.truckModel}'),
                          Text('Plate ${driver.licensePlate} • ${driver.rating.toStringAsFixed(1)} stars'),
                        ],
                      ),
                    ),
                    Text(
                      'NGN ${_fare(driver).toStringAsFixed(0)}',
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ],
                ),
              ),
            ),
          );
        }),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: <Widget>[
            OutlinedButton(onPressed: () => setState(() => _step = 0), child: const Text('Back')),
            FilledButton(
              onPressed: selectedDriver == null ? null : () => setState(() => _step = 2),
              child: const Text('Next'),
            ),
          ],
        ),
      ],
    );
  }

  Widget _paymentStep(DriverProfile? selectedDriver) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        SegmentedButton<PaymentMethod>(
          segments: PaymentMethod.values
              .map((PaymentMethod method) => ButtonSegment<PaymentMethod>(value: method, label: Text(method.label)))
              .toList(),
          selected: <PaymentMethod>{_paymentMethod},
          onSelectionChanged: (Set<PaymentMethod> values) => setState(() => _paymentMethod = values.first),
        ),
        const SizedBox(height: 16),
        if (_paymentMethod == PaymentMethod.card) ...<Widget>[
          TextField(controller: _cardHolder, decoration: const InputDecoration(labelText: 'Card holder')),
          const SizedBox(height: 12),
          TextField(controller: _cardNumber, decoration: const InputDecoration(labelText: 'Card number')),
          const SizedBox(height: 12),
          TextField(controller: _cardExpiry, decoration: const InputDecoration(labelText: 'Expiry MM/YY')),
        ],
        if (_paymentMethod == PaymentMethod.wallet)
          TextField(controller: _wallet, decoration: const InputDecoration(labelText: 'Wallet ID')),
        if (_paymentMethod == PaymentMethod.transfer)
          TextField(controller: _transfer, decoration: const InputDecoration(labelText: 'Transfer reference')),
        if (_paymentMethod == PaymentMethod.cash)
          const Padding(
            padding: EdgeInsets.only(bottom: 16),
            child: Text('Cash payment selected. The driver will see this before accepting.'),
          ),
        const SizedBox(height: 16),
        if (selectedDriver != null)
          Card(
            color: const Color(0xFFFFF7ED),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text('Driver: ${selectedDriver.displayName}'),
                  Text('Fare: NGN ${_fare(selectedDriver).toStringAsFixed(0)}'),
                  Text('Payment: ${_paymentMethod.label}'),
                  if (_paymentMethod == PaymentMethod.card && _cardNumber.text.isNotEmpty)
                    Text('Card ending in ${_last4(_cardNumber.text)}'),
                ],
              ),
            ),
          ),
        const SizedBox(height: 12),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: <Widget>[
            OutlinedButton(onPressed: () => setState(() => _step = 1), child: const Text('Back')),
            FilledButton(
              onPressed: _saving || selectedDriver == null || !_paymentReady ? null : () => _book(selectedDriver),
              child: _saving
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Request delivery'),
            ),
          ],
        ),
      ],
    );
  }
}

class CustomerOrders extends StatelessWidget {
  const CustomerOrders({super.key, required this.userId});

  final String userId;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance.collection('orders').where('customerId', isEqualTo: userId).snapshots(),
      builder: (BuildContext context, AsyncSnapshot<QuerySnapshot<Map<String, dynamic>>> snapshot) {
        final List<QueryDocumentSnapshot<Map<String, dynamic>>> docs =
            snapshot.data?.docs ?? <QueryDocumentSnapshot<Map<String, dynamic>>>[];
        docs.sort((QueryDocumentSnapshot<Map<String, dynamic>> a, QueryDocumentSnapshot<Map<String, dynamic>> b) {
          return _toDate(b.data()['createdAt']).compareTo(_toDate(a.data()['createdAt']));
        });
        return Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const Text('Your live orders', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
                const SizedBox(height: 10),
                if (docs.isEmpty)
                  const Text('No order yet.')
                else
                  ...docs.map((QueryDocumentSnapshot<Map<String, dynamic>> doc) {
                    final Map<String, dynamic> data = doc.data();
                    return ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text('${data['pickupLocation']} -> ${data['deliveryLocation']}'),
                      subtitle: Text(
                        '${readableStatus((data['status'] ?? '').toString())} • ${data['chosenDriverName'] ?? 'Pending driver'}',
                      ),
                      trailing: Text('NGN ${((data['estimatedFare'] ?? 0) as num).toStringAsFixed(0)}'),
                    );
                  }),
              ],
            ),
          ),
        );
      },
    );
  }
}

class DriverPanel extends StatelessWidget {
  const DriverPanel({
    super.key,
    required this.user,
    required this.driver,
    required this.onEdit,
  });

  final User user;
  final DriverProfile? driver;
  final Future<void> Function() onEdit;

  Future<void> _saveDriverField(String field, dynamic value) {
    return FirebaseFirestore.instance.collection('drivers').doc(user.uid).set(
      <String, dynamic>{field: value, 'updatedAt': FieldValue.serverTimestamp()},
      SetOptions(merge: true),
    );
  }

  Future<void> _accept(DocumentReference<Map<String, dynamic>> ref) async {
    await ref.set(
      <String, dynamic>{
        'status': 'accepted',
        'acceptedByDriverId': user.uid,
        'acceptedByDriverName': driver?.displayName ?? 'Farad Driver',
        'acceptedAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );
    await _saveDriverField('isAvailable', false);
  }

  Future<void> _setStatus(DocumentReference<Map<String, dynamic>> ref, String status) async {
    final Map<String, dynamic> payload = <String, dynamic>{
      'status': status,
      'updatedAt': FieldValue.serverTimestamp(),
    };
    if (status == 'delivered') {
      payload['deliveredAt'] = FieldValue.serverTimestamp();
      await _saveDriverField('isAvailable', true);
    }
    await ref.set(payload, SetOptions(merge: true));
  }

  @override
  Widget build(BuildContext context) {
    if (driver == null) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              const Text('Driver onboarding required', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              const Text('Complete the popup form so customers can see you live with your own fees.'),
              const SizedBox(height: 14),
              FilledButton(onPressed: onEdit, child: const Text('Open driver setup')),
            ],
          ),
        ),
      );
    }
    return Column(
      children: <Widget>[
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Row(
                  children: <Widget>[
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(driver!.displayName, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
                          Text('${driver!.vehicleType} • ${driver!.truckModel} • ${driver!.licensePlate}'),
                        ],
                      ),
                    ),
                    FilledButton.tonal(onPressed: onEdit, child: const Text('Edit')),
                  ],
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: <Widget>[
                    StatBox(title: 'Base fare', value: 'NGN ${driver!.baseFare.toStringAsFixed(0)}'),
                    StatBox(title: 'Fee / km', value: 'NGN ${driver!.feePerKm.toStringAsFixed(0)}'),
                    StatBox(title: 'Rating', value: driver!.rating.toStringAsFixed(1)),
                  ],
                ),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 12,
                  children: <Widget>[
                    FilterChip(
                      selected: driver!.isLive,
                      label: const Text('Live for bookings'),
                      onSelected: (bool value) => _saveDriverField('isLive', value),
                    ),
                    FilterChip(
                      selected: driver!.isAvailable,
                      label: const Text('Available now'),
                      onSelected: (bool value) => _saveDriverField('isAvailable', value),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 18),
        StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
          stream: FirebaseFirestore.instance.collection('orders').where('chosenDriverId', isEqualTo: user.uid).snapshots(),
          builder: (BuildContext context, AsyncSnapshot<QuerySnapshot<Map<String, dynamic>>> snapshot) {
            final List<QueryDocumentSnapshot<Map<String, dynamic>>> docs =
                snapshot.data?.docs ?? <QueryDocumentSnapshot<Map<String, dynamic>>>[];
            docs.sort((QueryDocumentSnapshot<Map<String, dynamic>> a, QueryDocumentSnapshot<Map<String, dynamic>> b) {
              return _toDate(b.data()['createdAt']).compareTo(_toDate(a.data()['createdAt']));
            });
            return Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    const Text('Driver dispatch board', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 10),
                    if (docs.isEmpty)
                      const Text('No requests yet.')
                    else
                      ...docs.map((QueryDocumentSnapshot<Map<String, dynamic>> doc) {
                        final Map<String, dynamic> data = doc.data();
                        final String status = (data['status'] ?? 'pending_driver').toString();
                        return Container(
                          margin: const EdgeInsets.only(bottom: 12),
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF8FAFC),
                            borderRadius: BorderRadius.circular(18),
                            border: Border.all(color: const Color(0xFFD0D5DD)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              Text(
                                '${data['pickupLocation']} -> ${data['deliveryLocation']}',
                                style: const TextStyle(fontWeight: FontWeight.w700),
                              ),
                              const SizedBox(height: 6),
                              Text('Customer: ${data['customerName'] ?? ''}'),
                              Text('Payment: ${data['paymentLabel'] ?? data['paymentMethod'] ?? ''}'),
                              Text('Fare: NGN ${((data['estimatedFare'] ?? 0) as num).toStringAsFixed(0)}'),
                              Text('Status: ${readableStatus(status)}'),
                              const SizedBox(height: 10),
                              Wrap(
                                spacing: 10,
                                runSpacing: 10,
                                children: <Widget>[
                                  if (status == 'pending_driver')
                                    FilledButton(onPressed: () => _accept(doc.reference), child: const Text('Accept')),
                                  if (status == 'accepted')
                                    FilledButton.tonal(
                                      onPressed: () => _setStatus(doc.reference, 'en_route'),
                                      child: const Text('Start trip'),
                                    ),
                                  if (status == 'en_route')
                                    FilledButton.tonal(
                                      onPressed: () => _setStatus(doc.reference, 'delivered'),
                                      child: const Text('Mark delivered'),
                                    ),
                                ],
                              ),
                            ],
                          ),
                        );
                      }),
                  ],
                ),
              ),
            );
          },
        ),
      ],
    );
  }
}

class DriverSetupDialog extends StatefulWidget {
  const DriverSetupDialog({
    super.key,
    required this.defaultName,
    required this.email,
  });

  final String defaultName;
  final String email;

  @override
  State<DriverSetupDialog> createState() => _DriverSetupDialogState();
}

class _DriverSetupDialogState extends State<DriverSetupDialog> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _name = TextEditingController();
  final TextEditingController _phone = TextEditingController();
  final TextEditingController _vehicleType = TextEditingController(text: 'Cargo Van');
  final TextEditingController _truckModel = TextEditingController();
  final TextEditingController _plate = TextEditingController();
  final TextEditingController _baseFare = TextEditingController(text: '3000');
  final TextEditingController _feePerKm = TextEditingController(text: '500');

  @override
  void initState() {
    super.initState();
    _name.text = widget.defaultName;
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _vehicleType.dispose();
    _truckModel.dispose();
    _plate.dispose();
    _baseFare.dispose();
    _feePerKm.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Driver onboarding'),
      content: SizedBox(
        width: 420,
        child: Form(
          key: _formKey,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                TextFormField(
                  controller: _name,
                  decoration: const InputDecoration(labelText: 'Display name'),
                  validator: (String? value) => value == null || value.trim().isEmpty ? 'Required' : null,
                ),
                const SizedBox(height: 10),
                TextFormField(initialValue: widget.email, readOnly: true, decoration: const InputDecoration(labelText: 'Email')),
                const SizedBox(height: 10),
                TextFormField(
                  controller: _phone,
                  decoration: const InputDecoration(labelText: 'Phone number'),
                  validator: (String? value) => value == null || value.trim().isEmpty ? 'Required' : null,
                ),
                const SizedBox(height: 10),
                TextFormField(
                  controller: _vehicleType,
                  decoration: const InputDecoration(labelText: 'Vehicle type'),
                  validator: (String? value) => value == null || value.trim().isEmpty ? 'Required' : null,
                ),
                const SizedBox(height: 10),
                TextFormField(
                  controller: _truckModel,
                  decoration: const InputDecoration(labelText: 'Truck model'),
                  validator: (String? value) => value == null || value.trim().isEmpty ? 'Required' : null,
                ),
                const SizedBox(height: 10),
                TextFormField(
                  controller: _plate,
                  decoration: const InputDecoration(labelText: 'License plate'),
                  validator: (String? value) => value == null || value.trim().isEmpty ? 'Required' : null,
                ),
                const SizedBox(height: 10),
                TextFormField(
                  controller: _baseFare,
                  decoration: const InputDecoration(labelText: 'Base fare (NGN)'),
                  validator: (String? value) => value == null || double.tryParse(value) == null ? 'Enter a number' : null,
                ),
                const SizedBox(height: 10),
                TextFormField(
                  controller: _feePerKm,
                  decoration: const InputDecoration(labelText: 'Fee per km (NGN)'),
                  validator: (String? value) => value == null || double.tryParse(value) == null ? 'Enter a number' : null,
                ),
              ],
            ),
          ),
        ),
      ),
      actions: <Widget>[
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(
          onPressed: () {
            if (!_formKey.currentState!.validate()) {
              return;
            }
            Navigator.of(context).pop(
              <String, dynamic>{
                'displayName': _name.text.trim(),
                'phone': _phone.text.trim(),
                'vehicleType': _vehicleType.text.trim(),
                'truckModel': _truckModel.text.trim(),
                'licensePlate': _plate.text.trim(),
                'baseFare': double.parse(_baseFare.text.trim()),
                'feePerKm': double.parse(_feePerKm.text.trim()),
              },
            );
          },
          child: const Text('Save'),
        ),
      ],
    );
  }
}

class AdminSnapshot extends StatelessWidget {
  const AdminSnapshot({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance.collection('drivers').snapshots(),
      builder: (BuildContext context, AsyncSnapshot<QuerySnapshot<Map<String, dynamic>>> driverSnapshot) {
        return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
          stream: FirebaseFirestore.instance.collection('orders').snapshots(),
          builder: (BuildContext context, AsyncSnapshot<QuerySnapshot<Map<String, dynamic>>> orderSnapshot) {
            final List<QueryDocumentSnapshot<Map<String, dynamic>>> drivers =
                driverSnapshot.data?.docs ?? <QueryDocumentSnapshot<Map<String, dynamic>>>[];
            final List<QueryDocumentSnapshot<Map<String, dynamic>>> orders =
                orderSnapshot.data?.docs ?? <QueryDocumentSnapshot<Map<String, dynamic>>>[];
            final int liveDrivers = drivers.where((QueryDocumentSnapshot<Map<String, dynamic>> doc) => doc.data()['isLive'] == true).length;
            final int activeOrders = orders.where((QueryDocumentSnapshot<Map<String, dynamic>> doc) => doc.data()['status'] != 'delivered').length;
            return Card(
              color: const Color(0xFFECFDF5),
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: <Widget>[
                    StatBox(title: 'Drivers', value: '${drivers.length}'),
                    StatBox(title: 'Live drivers', value: '$liveDrivers'),
                    StatBox(title: 'Orders', value: '${orders.length}'),
                    StatBox(title: 'Active orders', value: '$activeOrders'),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }
}

class StatBox extends StatelessWidget {
  const StatBox({super.key, required this.title, required this.value});

  final String title;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 170,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFD0D5DD)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(title, style: const TextStyle(color: Color(0xFF475467))),
          const SizedBox(height: 8),
          Text(value, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

DateTime _toDate(dynamic value) {
  if (value is Timestamp) {
    return value.toDate();
  }
  return DateTime.fromMillisecondsSinceEpoch(0);
}

String readableStatus(String value) {
  switch (value) {
    case 'pending_driver':
      return 'Waiting for driver';
    case 'accepted':
      return 'Driver accepted';
    case 'en_route':
      return 'Driver en route';
    case 'delivered':
      return 'Delivered';
    default:
      return value.replaceAll('_', ' ');
  }
}
