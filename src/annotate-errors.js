class AnnotationError extends Error {
  constructor(message, code = 'ANNOTATION_ERROR') {
    super(message);
    this.name = 'AnnotationError';
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

class FileNotFoundError extends AnnotationError {
  constructor(filePath) {
    super(`File not found: ${filePath}`, 'FILE_NOT_FOUND');
    this.name = 'FileNotFoundError';
    this.filePath = filePath;
  }
}

class InvalidParameterError extends AnnotationError {
  constructor(message, param) {
    super(message, 'INVALID_PARAMETER');
    this.name = 'InvalidParameterError';
    this.param = param;
  }
}

class ImageProcessingError extends AnnotationError {
  constructor(message, originalError) {
    super(message, 'IMAGE_PROCESSING_ERROR');
    this.name = 'ImageProcessingError';
    this.originalError = originalError;
  }
}

class AnnotationTypeError extends AnnotationError {
  constructor(type) {
    super(`Unknown annotation type: ${type}`, 'ANNOTATION_TYPE_ERROR');
    this.name = 'AnnotationTypeError';
    this.type = type;
  }
}

class ValidationError extends AnnotationError {
  constructor(message) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

class CoordinateClampWarning {
  constructor(annotation, property, original, clamped) {
    this.annotation = annotation;
    this.property = property;
    this.original = original;
    this.clamped = clamped;
  }
}

module.exports = {
  AnnotationError,
  FileNotFoundError,
  InvalidParameterError,
  ImageProcessingError,
  AnnotationTypeError,
  ValidationError,
  CoordinateClampWarning
};
