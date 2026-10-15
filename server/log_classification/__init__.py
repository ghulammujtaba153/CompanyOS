"""Hybrid log classification (regex → embeddings → LLM) with Brevo issue alerts.

Architecture adapted from the educational hybrid framework pattern:
https://github.com/codebasics/project-nlp-log-classification
"""

from log_classification.classify import classify, classify_log, classify_records

__all__ = ["classify", "classify_log", "classify_records"]
