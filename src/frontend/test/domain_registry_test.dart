import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lingxi_companion/utils/domain_registry.dart';

void main() {
  test('kLearningDomains pins 6 domains incl english in order', () {
    expect(kLearningDomains.map((d) => d.key).toList(),
        ['language', 'math', 'science', 'art', 'social', 'english']);
  });

  test('labels and colors', () {
    expect(domainLabel('english'), '英语');
    expect(domainLabel('social'), '社交');
    expect(domainColor('language'), const Color(0xFF006384));
  });

  test('domainSpec falls back to raw key without throwing', () {
    final spec = domainSpec('music');
    expect(spec.key, 'music');
    expect(spec.label, 'music');
    expect(spec.color, const Color(0xFF9E9E9E));
  });

  test('domainLabel/domainColor unknown key fallback', () {
    expect(domainLabel('unknown'), 'unknown');
    expect(domainColor('unknown'), const Color(0xFF9E9E9E));
  });
}