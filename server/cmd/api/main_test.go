package main

import "testing"

func TestNormalizeEmail(t *testing.T) {
	got := normalizeEmail("  Person@Example.COM ")
	if got != "person@example.com" {
		t.Fatalf("normalizeEmail() = %q", got)
	}
}

func TestValidEmail(t *testing.T) {
	cases := []struct {
		value string
		want  bool
	}{
		{"person@example.com", true},
		{"not-an-email", false},
		{"person @example.com", false},
	}
	for _, tc := range cases {
		if got := validEmail(tc.value); got != tc.want {
			t.Errorf("validEmail(%q) = %v, want %v", tc.value, got, tc.want)
		}
	}
}
