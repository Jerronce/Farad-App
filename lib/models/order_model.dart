import 'package:cloud_firestore/cloud_firestore.dart';

class Order {
  final String id;
  final String customerId;
  final String customerName;
  final String driverId;
  final String driverName;
  final String truckId;
  final String pickupLocation;
  final String deliveryLocation;
  final double amount;
  final String paymentStatus;
  final String orderStatus;
  final String? transactionRef;
  final DateTime createdAt;
  final DateTime? completedAt;

  Order({
    required this.id,
    required this.customerId,
    required this.customerName,
    required this.driverId,
    required this.driverName,
    required this.truckId,
    required this.pickupLocation,
    required this.deliveryLocation,
    required this.amount,
    required this.paymentStatus,
    required this.orderStatus,
    this.transactionRef,
    required this.createdAt,
    this.completedAt,
  });

  factory Order.fromFirestore(DocumentSnapshot doc) {
    Map data = doc.data() as Map<String, dynamic>;
    return Order(
      id: doc.id,
      customerId: data['customerId'] ?? '',
      customerName: data['customerName'] ?? '',
      driverId: data['driverId'] ?? '',
      driverName: data['driverName'] ?? '',
      truckId: data['truckId'] ?? '',
      pickupLocation: data['pickupLocation'] ?? '',
      deliveryLocation: data['deliveryLocation'] ?? '',
      amount: (data['amount'] ?? 0).toDouble(),
      paymentStatus: data['paymentStatus'] ?? 'pending',
      orderStatus: data['orderStatus'] ?? 'requested',
      transactionRef: data['transactionRef'],
      createdAt: (data['createdAt'] as Timestamp).toDate(),
      completedAt: data['completedAt'] != null ? (data['completedAt'] as Timestamp).toDate() : null,
    );
  }

  Map<String, dynamic> toMap() => {
    'customerId': customerId,
    'customerName': customerName,
    'driverId': driverId,
    'driverName': driverName,
    'truckId': truckId,
    'pickupLocation': pickupLocation,
    'deliveryLocation': deliveryLocation,
    'amount': amount,
    'paymentStatus': paymentStatus,
    'orderStatus': orderStatus,
    'transactionRef': transactionRef,
    'createdAt': Timestamp.fromDate(createdAt),
    'completedAt': completedAt != null ? Timestamp.fromDate(completedAt!) : null,
  };
}
