/// 统一的 API 结果类型
///
/// 替代原有 `catch (e) { return null; }` 模式，
/// 让 API 层返回带类型的成功/失败结果。
///
/// 用法：
/// ```dart
/// final result = await api.getContentDetailResult(42);
/// switch (result) {
///   case ApiSuccess(:final data):
///     // 使用 data
///   case ApiError(:final message, :final type):
///     // 根据 type 显示不同错误提示
/// }
/// ```
library;

sealed class ApiResult<T> {
  const ApiResult();
}

/// API 调用成功，携带 [data]
class ApiSuccess<T> extends ApiResult<T> {
  final T data;
  const ApiSuccess(this.data);
}

/// API 调用失败，包含错误信息和类型
class ApiError<T> extends ApiResult<T> {
  final String message;
  final ApiErrorType type;
  final int? statusCode;

  const ApiError(
    this.message, {
    this.type = ApiErrorType.unknown,
    this.statusCode,
  });

  /// 是否可重试（网络超时或服务器错误通常可重试）
  bool get isRetryable =>
      type == ApiErrorType.networkTimeout ||
      type == ApiErrorType.serverError;
}

/// API 错误类型枚举
enum ApiErrorType {
  /// 网络超时（连接/接收/发送超时）
  networkTimeout,

  /// 服务器内部错误（5xx）
  serverError,

  /// 客户端请求错误（4xx，排除 401/404）
  clientError,

  /// 未授权（401）
  unauthorized,

  /// 资源不存在（404）
  notFound,

  /// 未知错误
  unknown,
}