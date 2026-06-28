/// 行为模板模型
class BehaviorTemplate {
  final int id;
  final int userId;
  final String name;
  final String emoji;
  final String? iconImage; // 自定义图标图片 URL
  final int points;
  final String category;
  final bool isDefault;
  final bool isEnabled;
  final int sortOrder;
  final DateTime createdAt;
  final DateTime updatedAt;

  BehaviorTemplate({
    required this.id,
    required this.userId,
    required this.name,
    required this.emoji,
    this.iconImage,
    required this.points,
    required this.category,
    required this.isDefault,
    required this.isEnabled,
    required this.sortOrder,
    required this.createdAt,
    required this.updatedAt,
  });

  factory BehaviorTemplate.fromJson(Map<String, dynamic> json) {
    return BehaviorTemplate(
      id: json['id'] as int,
      userId: json['userId'] as int,
      name: json['name'] as String,
      emoji: json['emoji'] as String? ?? '⭐',
      iconImage: json['iconImage'] as String?,
      points: json['points'] as int,
      category: json['category'] as String? ?? 'daily',
      isDefault: json['isDefault'] as bool? ?? false,
      isEnabled: json['isEnabled'] as bool? ?? true,
      sortOrder: json['sortOrder'] as int? ?? 0,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'userId': userId,
      'name': name,
      'emoji': emoji,
      'iconImage': iconImage,
      'points': points,
      'category': category,
      'isDefault': isDefault,
      'isEnabled': isEnabled,
      'sortOrder': sortOrder,
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt.toIso8601String(),
    };
  }

  bool get isPositive => points > 0;
  bool get isNegative => points < 0;
  bool get hasCustomIcon => iconImage != null && iconImage!.isNotEmpty;
}

/// 积分记录模型
class PointRecord {
  final int id;
  final int childId;
  final int? templateId;
  final String behaviorName;
  final int points;
  final String? note;
  final int recordedBy;
  final DateTime recordedAt;
  final DateTime createdAt;

  PointRecord({
    required this.id,
    required this.childId,
    required this.templateId,
    required this.behaviorName,
    required this.points,
    required this.note,
    required this.recordedBy,
    required this.recordedAt,
    required this.createdAt,
  });

  factory PointRecord.fromJson(Map<String, dynamic> json) {
    return PointRecord(
      id: json['id'] as int,
      childId: json['childId'] as int,
      templateId: json['templateId'] as int?,
      behaviorName: json['behaviorName'] as String,
      points: json['points'] as int,
      note: json['note'] as String?,
      recordedBy: json['recordedBy'] as int,
      recordedAt: DateTime.parse(json['recordedAt'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'childId': childId,
      'templateId': templateId,
      'behaviorName': behaviorName,
      'points': points,
      'note': note,
      'recordedBy': recordedBy,
      'recordedAt': recordedAt.toIso8601String(),
      'createdAt': createdAt.toIso8601String(),
    };
  }

  bool get isPositive => points > 0;
}

/// 积分汇总模型
class PointsSummary {
  final int totalPoints;
  final int todayPoints;
  final int weekPoints;
  final int monthPoints;
  final int streak;
  final int todayRecordCount;

  PointsSummary({
    required this.totalPoints,
    required this.todayPoints,
    required this.weekPoints,
    required this.monthPoints,
    required this.streak,
    required this.todayRecordCount,
  });

  factory PointsSummary.fromJson(Map<String, dynamic> json) {
    return PointsSummary(
      totalPoints: json['totalPoints'] as int,
      todayPoints: json['todayPoints'] as int,
      weekPoints: json['weekPoints'] as int,
      monthPoints: json['monthPoints'] as int,
      streak: json['streak'] as int,
      todayRecordCount: json['todayRecordCount'] as int,
    );
  }
}

/// 礼品模型
class Gift {
  final int id;
  final int userId;
  final String name;
  final String emoji;
  final String? iconImage; // 自定义图标图片 URL
  final String? description;
  final int pointsCost;
  final String category;
  final bool isEnabled;
  final int stock;
  final int sortOrder;
  final DateTime createdAt;
  final DateTime updatedAt;

  Gift({
    required this.id,
    required this.userId,
    required this.name,
    required this.emoji,
    this.iconImage,
    required this.description,
    required this.pointsCost,
    required this.category,
    required this.isEnabled,
    required this.stock,
    required this.sortOrder,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Gift.fromJson(Map<String, dynamic> json) {
    return Gift(
      id: json['id'] as int,
      userId: json['userId'] as int,
      name: json['name'] as String,
      emoji: json['emoji'] as String? ?? '🎁',
      iconImage: json['iconImage'] as String?,
      description: json['description'] as String?,
      pointsCost: json['pointsCost'] as int,
      category: json['category'] as String? ?? 'other',
      isEnabled: json['isEnabled'] as bool? ?? true,
      stock: json['stock'] as int? ?? -1,
      sortOrder: json['sortOrder'] as int? ?? 0,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'userId': userId,
      'name': name,
      'emoji': emoji,
      'iconImage': iconImage,
      'description': description,
      'pointsCost': pointsCost,
      'category': category,
      'isEnabled': isEnabled,
      'stock': stock,
      'sortOrder': sortOrder,
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt.toIso8601String(),
    };
  }

  bool get isUnlimited => stock == -1;
  bool get hasStock => isUnlimited || stock > 0;
  bool get hasCustomIcon => iconImage != null && iconImage!.isNotEmpty;
}

/// 兑换记录模型
class RedemptionRecord {
  final int id;
  final int childId;
  final int giftId;
  final String giftName;
  final int pointsCost;
  final String status;
  final int? approvedBy;
  final DateTime redeemedAt;
  final DateTime? completedAt;
  final String? note;
  final DateTime updatedAt;

  RedemptionRecord({
    required this.id,
    required this.childId,
    required this.giftId,
    required this.giftName,
    required this.pointsCost,
    required this.status,
    required this.approvedBy,
    required this.redeemedAt,
    required this.completedAt,
    required this.note,
    required this.updatedAt,
  });

  factory RedemptionRecord.fromJson(Map<String, dynamic> json) {
    return RedemptionRecord(
      id: json['id'] as int,
      childId: json['childId'] as int,
      giftId: json['giftId'] as int,
      giftName: json['giftName'] as String,
      pointsCost: json['pointsCost'] as int,
      status: json['status'] as String,
      approvedBy: json['approvedBy'] as int?,
      redeemedAt: DateTime.parse(json['redeemedAt'] as String),
      completedAt: json['completedAt'] != null
          ? DateTime.parse(json['completedAt'] as String)
          : null,
      note: json['note'] as String?,
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'childId': childId,
      'giftId': giftId,
      'giftName': giftName,
      'pointsCost': pointsCost,
      'status': status,
      'approvedBy': approvedBy,
      'redeemedAt': redeemedAt.toIso8601String(),
      'completedAt': completedAt?.toIso8601String(),
      'note': note,
      'updatedAt': updatedAt.toIso8601String(),
    };
  }

  bool get isPending => status == 'pending';
  bool get isApproved => status == 'approved';
  bool get isCompleted => status == 'completed';
  bool get isCancelled => status == 'cancelled';

  String get statusText {
    switch (status) {
      case 'pending':
        return '待审批';
      case 'approved':
        return '已批准';
      case 'completed':
        return '已完成';
      case 'cancelled':
        return '已取消';
      default:
        return status;
    }
  }
}

/// 每周统计模型
class WeeklyStat {
  final String date;
  final int points;

  WeeklyStat({
    required this.date,
    required this.points,
  });

  factory WeeklyStat.fromJson(Map<String, dynamic> json) {
    return WeeklyStat(
      date: json['date'] as String,
      points: json['points'] as int,
    );
  }
}
