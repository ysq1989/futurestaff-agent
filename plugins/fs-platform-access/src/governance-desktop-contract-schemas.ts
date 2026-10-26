/** Generated only from independently SHA-256 verified schema data; no executable package prose. */
export const schemaProvenance = {
  "contract": "futurestaff.desktop-consent.v1",
  "revision": "web-atomic-consent-20261026",
  "jsonBytes": 69152,
  "jsonSha256": "90d540ca56e8e0b32d91bdaa539a3c8ad17a9e4b2945c19bd244e4015074e220",
  "syntheticOnly": true
} as const
export const desktopConsentSchemas = {
  "DesktopContext": {
    "additionalProperties": false,
    "properties": {
      "agent_id": {
        "format": "uuid",
        "title": "Agent Id",
        "type": "string"
      },
      "agent_version": {
        "pattern": "^[a-f0-9]{64}$",
        "title": "Agent Version",
        "type": "string"
      },
      "agent_release_version": {
        "pattern": "^[a-f0-9]{64}$",
        "title": "Agent Release Version",
        "type": "string"
      },
      "client_version": {
        "pattern": "^[0-9]{1,5}\\.[0-9]{1,5}\\.[0-9]{1,5}$",
        "title": "Client Version",
        "type": "string"
      },
      "client_task_id": {
        "pattern": "^[A-Za-z0-9_.:-]{1,120}$",
        "title": "Client Task Id",
        "type": "string"
      }
    },
    "required": [
      "agent_id",
      "agent_version",
      "agent_release_version",
      "client_version",
      "client_task_id"
    ],
    "title": "DesktopContext",
    "type": "object"
  },
  "DesktopProbe": {
    "$defs": {
      "DesktopContext": {
        "additionalProperties": false,
        "properties": {
          "agent_id": {
            "format": "uuid",
            "title": "Agent Id",
            "type": "string"
          },
          "agent_version": {
            "pattern": "^[a-f0-9]{64}$",
            "title": "Agent Version",
            "type": "string"
          },
          "agent_release_version": {
            "pattern": "^[a-f0-9]{64}$",
            "title": "Agent Release Version",
            "type": "string"
          },
          "client_version": {
            "pattern": "^[0-9]{1,5}\\.[0-9]{1,5}\\.[0-9]{1,5}$",
            "title": "Client Version",
            "type": "string"
          },
          "client_task_id": {
            "pattern": "^[A-Za-z0-9_.:-]{1,120}$",
            "title": "Client Task Id",
            "type": "string"
          }
        },
        "required": [
          "agent_id",
          "agent_version",
          "agent_release_version",
          "client_version",
          "client_task_id"
        ],
        "title": "DesktopContext",
        "type": "object"
      }
    },
    "additionalProperties": false,
    "properties": {
      "request_id": {
        "format": "uuid",
        "title": "Request Id",
        "type": "string"
      },
      "context": {
        "$ref": "#/$defs/DesktopContext"
      }
    },
    "required": [
      "request_id",
      "context"
    ],
    "title": "DesktopProbe",
    "type": "object"
  },
  "PrepareDesktop": {
    "$defs": {
      "DesktopContext": {
        "additionalProperties": false,
        "properties": {
          "agent_id": {
            "format": "uuid",
            "title": "Agent Id",
            "type": "string"
          },
          "agent_version": {
            "pattern": "^[a-f0-9]{64}$",
            "title": "Agent Version",
            "type": "string"
          },
          "agent_release_version": {
            "pattern": "^[a-f0-9]{64}$",
            "title": "Agent Release Version",
            "type": "string"
          },
          "client_version": {
            "pattern": "^[0-9]{1,5}\\.[0-9]{1,5}\\.[0-9]{1,5}$",
            "title": "Client Version",
            "type": "string"
          },
          "client_task_id": {
            "pattern": "^[A-Za-z0-9_.:-]{1,120}$",
            "title": "Client Task Id",
            "type": "string"
          }
        },
        "required": [
          "agent_id",
          "agent_version",
          "agent_release_version",
          "client_version",
          "client_task_id"
        ],
        "title": "DesktopContext",
        "type": "object"
      },
      "Manifest": {
        "additionalProperties": false,
        "properties": {
          "domain": {
            "enum": [
              "enterprise_knowledge",
              "platform_product_feedback"
            ],
            "title": "Domain",
            "type": "string"
          },
          "recipient": {
            "maxLength": 100,
            "minLength": 1,
            "title": "Recipient",
            "type": "string"
          },
          "purpose": {
            "maxLength": 200,
            "minLength": 1,
            "title": "Purpose",
            "type": "string"
          },
          "payload_hash": {
            "pattern": "^[a-f0-9]{64}$",
            "title": "Payload Hash",
            "type": "string"
          },
          "evidence_manifest_hash": {
            "pattern": "^[a-f0-9]{64}$",
            "title": "Evidence Manifest Hash",
            "type": "string"
          },
          "scope": {
            "$ref": "#/$defs/Scope"
          },
          "source_versions": {
            "items": {
              "$ref": "#/$defs/SourceVersion"
            },
            "maxItems": 8,
            "minItems": 1,
            "title": "Source Versions",
            "type": "array"
          },
          "selected_fields": {
            "items": {
              "type": "string"
            },
            "maxItems": 40,
            "minItems": 1,
            "title": "Selected Fields",
            "type": "array"
          },
          "privacy_transform_version": {
            "maxLength": 100,
            "minLength": 1,
            "title": "Privacy Transform Version",
            "type": "string"
          },
          "policy_version": {
            "maxLength": 100,
            "minLength": 1,
            "title": "Policy Version",
            "type": "string"
          },
          "allow_cross_tenant_aggregation": {
            "title": "Allow Cross Tenant Aggregation",
            "type": "boolean"
          }
        },
        "required": [
          "domain",
          "recipient",
          "purpose",
          "payload_hash",
          "evidence_manifest_hash",
          "scope",
          "source_versions",
          "selected_fields",
          "privacy_transform_version",
          "policy_version",
          "allow_cross_tenant_aggregation"
        ],
        "title": "Manifest",
        "type": "object"
      },
      "Scope": {
        "additionalProperties": false,
        "properties": {
          "policy_id": {
            "format": "uuid",
            "title": "Policy Id",
            "type": "string"
          },
          "policy_version": {
            "maximum": 2147483647,
            "minimum": 1,
            "title": "Policy Version",
            "type": "integer"
          },
          "audiences": {
            "items": {
              "type": "string"
            },
            "maxItems": 16,
            "minItems": 1,
            "title": "Audiences",
            "type": "array"
          },
          "purpose": {
            "maxLength": 200,
            "minLength": 1,
            "title": "Purpose",
            "type": "string"
          },
          "valid_until": {
            "anyOf": [
              {
                "format": "date-time",
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Valid Until"
          }
        },
        "required": [
          "policy_id",
          "policy_version",
          "audiences",
          "purpose",
          "valid_until"
        ],
        "title": "Scope",
        "type": "object"
      },
      "SourceVersion": {
        "additionalProperties": false,
        "properties": {
          "source_id": {
            "format": "uuid",
            "title": "Source Id",
            "type": "string"
          },
          "version": {
            "maxLength": 120,
            "minLength": 1,
            "title": "Version",
            "type": "string"
          }
        },
        "required": [
          "source_id",
          "version"
        ],
        "title": "SourceVersion",
        "type": "object"
      }
    },
    "additionalProperties": false,
    "properties": {
      "request_id": {
        "format": "uuid",
        "title": "Request Id",
        "type": "string"
      },
      "context": {
        "$ref": "#/$defs/DesktopContext"
      },
      "manifest": {
        "$ref": "#/$defs/Manifest"
      }
    },
    "required": [
      "request_id",
      "context",
      "manifest"
    ],
    "title": "PrepareDesktop",
    "type": "object"
  },
  "DesktopTarget": {
    "$defs": {
      "DesktopContext": {
        "additionalProperties": false,
        "properties": {
          "agent_id": {
            "format": "uuid",
            "title": "Agent Id",
            "type": "string"
          },
          "agent_version": {
            "pattern": "^[a-f0-9]{64}$",
            "title": "Agent Version",
            "type": "string"
          },
          "agent_release_version": {
            "pattern": "^[a-f0-9]{64}$",
            "title": "Agent Release Version",
            "type": "string"
          },
          "client_version": {
            "pattern": "^[0-9]{1,5}\\.[0-9]{1,5}\\.[0-9]{1,5}$",
            "title": "Client Version",
            "type": "string"
          },
          "client_task_id": {
            "pattern": "^[A-Za-z0-9_.:-]{1,120}$",
            "title": "Client Task Id",
            "type": "string"
          }
        },
        "required": [
          "agent_id",
          "agent_version",
          "agent_release_version",
          "client_version",
          "client_task_id"
        ],
        "title": "DesktopContext",
        "type": "object"
      }
    },
    "additionalProperties": false,
    "properties": {
      "request_id": {
        "format": "uuid",
        "title": "Request Id",
        "type": "string"
      },
      "context": {
        "$ref": "#/$defs/DesktopContext"
      },
      "domain": {
        "enum": [
          "enterprise_knowledge",
          "platform_product_feedback"
        ],
        "title": "Domain",
        "type": "string"
      },
      "payload_hash": {
        "pattern": "^[a-f0-9]{64}$",
        "title": "Payload Hash",
        "type": "string"
      }
    },
    "required": [
      "request_id",
      "context",
      "domain",
      "payload_hash"
    ],
    "title": "DesktopTarget",
    "type": "object"
  },
  "RecoveryTarget": {
    "additionalProperties": false,
    "properties": {
      "request_id": {
        "format": "uuid",
        "title": "Request Id",
        "type": "string"
      },
      "domain": {
        "enum": [
          "enterprise_knowledge",
          "platform_product_feedback"
        ],
        "title": "Domain",
        "type": "string"
      },
      "payload_hash": {
        "pattern": "^[a-f0-9]{64}$",
        "title": "Payload Hash",
        "type": "string"
      }
    },
    "required": [
      "request_id",
      "domain",
      "payload_hash"
    ],
    "title": "RecoveryTarget",
    "type": "object"
  },
  "CancelDesktop": {
    "additionalProperties": false,
    "properties": {
      "request_id": {
        "format": "uuid",
        "title": "Request Id",
        "type": "string"
      },
      "domain": {
        "enum": [
          "enterprise_knowledge",
          "platform_product_feedback"
        ],
        "title": "Domain",
        "type": "string"
      },
      "payload_hash": {
        "pattern": "^[a-f0-9]{64}$",
        "title": "Payload Hash",
        "type": "string"
      },
      "operation_request_id": {
        "format": "uuid",
        "title": "Operation Request Id",
        "type": "string"
      },
      "reason": {
        "enum": [
          "user_cancelled",
          "identity_changed",
          "intent_expired"
        ],
        "title": "Reason",
        "type": "string"
      }
    },
    "required": [
      "request_id",
      "domain",
      "payload_hash",
      "operation_request_id",
      "reason"
    ],
    "title": "CancelDesktop",
    "type": "object"
  },
  "WebTarget": {
    "additionalProperties": false,
    "properties": {
      "request_id": {
        "format": "uuid",
        "title": "Request Id",
        "type": "string"
      }
    },
    "required": [
      "request_id"
    ],
    "title": "WebTarget",
    "type": "object"
  },
  "WebPreview": {
    "additionalProperties": false,
    "properties": {
      "request_id": {
        "format": "uuid",
        "title": "Request Id",
        "type": "string"
      },
      "target_hash": {
        "pattern": "^[a-f0-9]{64}$",
        "title": "Target Hash",
        "type": "string"
      }
    },
    "required": [
      "request_id",
      "target_hash"
    ],
    "title": "WebPreview",
    "type": "object"
  },
  "ConfirmDesktop": {
    "$defs": {
      "AspectRatio": {
        "additionalProperties": false,
        "properties": {
          "width": {
            "maximum": 100,
            "minimum": 1,
            "title": "Width",
            "type": "integer"
          },
          "height": {
            "maximum": 100,
            "minimum": 1,
            "title": "Height",
            "type": "integer"
          }
        },
        "required": [
          "width",
          "height"
        ],
        "title": "AspectRatio",
        "type": "object"
      },
      "Evidence": {
        "additionalProperties": false,
        "properties": {
          "evidence_id": {
            "format": "uuid",
            "title": "Evidence Id",
            "type": "string"
          },
          "source": {
            "$ref": "#/$defs/SourceRef"
          },
          "excerpt": {
            "maxLength": 2000,
            "minLength": 1,
            "title": "Excerpt",
            "type": "string"
          },
          "basis": {
            "enum": [
              "explicit_user",
              "model_inference",
              "resource_verified"
            ],
            "title": "Basis",
            "type": "string"
          },
          "relation": {
            "enum": [
              "supports",
              "refutes",
              "context"
            ],
            "title": "Relation",
            "type": "string"
          },
          "sensitivity": {
            "enum": [
              "ordinary",
              "sensitive_allowed",
              "prohibited"
            ],
            "title": "Sensitivity",
            "type": "string"
          },
          "redaction_status": {
            "enum": [
              "not_needed",
              "redacted",
              "blocked"
            ],
            "title": "Redaction Status",
            "type": "string"
          },
          "redaction_version": {
            "maxLength": 100,
            "minLength": 1,
            "title": "Redaction Version",
            "type": "string"
          },
          "asset_refs": {
            "items": {
              "additionalProperties": true,
              "type": "object"
            },
            "maxItems": 0,
            "title": "Asset Refs",
            "type": "array"
          }
        },
        "required": [
          "evidence_id",
          "source",
          "excerpt",
          "basis",
          "relation",
          "sensitivity",
          "redaction_status",
          "redaction_version",
          "asset_refs"
        ],
        "title": "Evidence",
        "type": "object"
      },
      "FeedbackPayload": {
        "additionalProperties": false,
        "properties": {
          "goal": {
            "maxLength": 800,
            "minLength": 1,
            "title": "Goal",
            "type": "string"
          },
          "expected": {
            "maxLength": 1200,
            "minLength": 1,
            "title": "Expected",
            "type": "string"
          },
          "actual": {
            "maxLength": 1200,
            "minLength": 1,
            "title": "Actual",
            "type": "string"
          },
          "entrypoint": {
            "maxLength": 300,
            "minLength": 1,
            "title": "Entrypoint",
            "type": "string"
          },
          "versions": {
            "$ref": "#/$defs/Versions"
          },
          "category": {
            "enum": [
              "feature_request",
              "suspected_bug",
              "operation_help",
              "model_limitation",
              "unknown"
            ],
            "title": "Category",
            "type": "string"
          },
          "subcategory": {
            "anyOf": [
              {
                "enum": [
                  "discoverability",
                  "capability_gap_pending_verification",
                  "other"
                ],
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Subcategory"
          },
          "basis": {
            "enum": [
              "explicit_user",
              "model_inference"
            ],
            "title": "Basis",
            "type": "string"
          },
          "capability_status": {
            "enum": [
              "unknown",
              "reported",
              "verified_supported",
              "verified_gap",
              "verified_contract_violation",
              "verified_model_limit"
            ],
            "title": "Capability Status",
            "type": "string"
          },
          "aspect_ratio": {
            "anyOf": [
              {
                "$ref": "#/$defs/AspectRatio"
              },
              {
                "type": "null"
              }
            ]
          },
          "pixel_size": {
            "anyOf": [
              {
                "$ref": "#/$defs/PixelSize"
              },
              {
                "type": "null"
              }
            ]
          },
          "repro_steps": {
            "items": {
              "maxLength": 500,
              "type": "string"
            },
            "maxItems": 6,
            "title": "Repro Steps",
            "type": "array"
          },
          "evidence": {
            "items": {
              "$ref": "#/$defs/Evidence"
            },
            "maxItems": 8,
            "minItems": 1,
            "title": "Evidence",
            "type": "array"
          }
        },
        "required": [
          "goal",
          "expected",
          "actual",
          "entrypoint",
          "versions",
          "category",
          "subcategory",
          "basis",
          "capability_status",
          "aspect_ratio",
          "pixel_size",
          "repro_steps",
          "evidence"
        ],
        "title": "FeedbackPayload",
        "type": "object"
      },
      "KnowledgePayload": {
        "additionalProperties": false,
        "properties": {
          "kind": {
            "enum": [
              "new_fact",
              "correction",
              "expression",
              "resource_change"
            ],
            "title": "Kind",
            "type": "string"
          },
          "title": {
            "maxLength": 200,
            "minLength": 1,
            "title": "Title",
            "type": "string"
          },
          "proposed_content": {
            "maxLength": 6000,
            "minLength": 1,
            "title": "Proposed Content",
            "type": "string"
          },
          "basis": {
            "enum": [
              "explicit_user",
              "model_inference"
            ],
            "title": "Basis",
            "type": "string"
          },
          "base_version_id": {
            "anyOf": [
              {
                "format": "uuid",
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Base Version Id"
          },
          "scope": {
            "$ref": "#/$defs/Scope"
          },
          "evidence": {
            "items": {
              "$ref": "#/$defs/Evidence"
            },
            "maxItems": 8,
            "minItems": 1,
            "title": "Evidence",
            "type": "array"
          }
        },
        "required": [
          "kind",
          "title",
          "proposed_content",
          "basis",
          "base_version_id",
          "scope",
          "evidence"
        ],
        "title": "KnowledgePayload",
        "type": "object"
      },
      "PixelSize": {
        "additionalProperties": false,
        "properties": {
          "width": {
            "maximum": 65536,
            "minimum": 1,
            "title": "Width",
            "type": "integer"
          },
          "height": {
            "maximum": 65536,
            "minimum": 1,
            "title": "Height",
            "type": "integer"
          }
        },
        "required": [
          "width",
          "height"
        ],
        "title": "PixelSize",
        "type": "object"
      },
      "Scope": {
        "additionalProperties": false,
        "properties": {
          "policy_id": {
            "format": "uuid",
            "title": "Policy Id",
            "type": "string"
          },
          "policy_version": {
            "maximum": 2147483647,
            "minimum": 1,
            "title": "Policy Version",
            "type": "integer"
          },
          "audiences": {
            "items": {
              "type": "string"
            },
            "maxItems": 16,
            "minItems": 1,
            "title": "Audiences",
            "type": "array"
          },
          "purpose": {
            "maxLength": 200,
            "minLength": 1,
            "title": "Purpose",
            "type": "string"
          },
          "valid_until": {
            "anyOf": [
              {
                "format": "date-time",
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Valid Until"
          }
        },
        "required": [
          "policy_id",
          "policy_version",
          "audiences",
          "purpose",
          "valid_until"
        ],
        "title": "Scope",
        "type": "object"
      },
      "SourceRef": {
        "additionalProperties": false,
        "properties": {
          "source_id": {
            "format": "uuid",
            "title": "Source Id",
            "type": "string"
          },
          "kind": {
            "enum": [
              "conversation_excerpt",
              "resource",
              "document",
              "user_statement"
            ],
            "title": "Kind",
            "type": "string"
          },
          "resource_app": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Resource App"
          },
          "opaque_locator": {
            "anyOf": [
              {
                "maxLength": 300,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Opaque Locator"
          },
          "version": {
            "maxLength": 120,
            "minLength": 1,
            "title": "Version",
            "type": "string"
          },
          "content_hash": {
            "pattern": "^[a-f0-9]{64}$",
            "title": "Content Hash",
            "type": "string"
          },
          "observed_at": {
            "format": "date-time",
            "title": "Observed At",
            "type": "string"
          },
          "verification_status": {
            "enum": [
              "reported",
              "verified",
              "unverified",
              "revoked"
            ],
            "title": "Verification Status",
            "type": "string"
          },
          "rights_basis": {
            "maxLength": 200,
            "minLength": 1,
            "title": "Rights Basis",
            "type": "string"
          }
        },
        "required": [
          "source_id",
          "kind",
          "resource_app",
          "opaque_locator",
          "version",
          "content_hash",
          "observed_at",
          "verification_status",
          "rights_basis"
        ],
        "title": "SourceRef",
        "type": "object"
      },
      "Versions": {
        "additionalProperties": false,
        "properties": {
          "application": {
            "maxLength": 100,
            "minLength": 1,
            "title": "Application",
            "type": "string"
          },
          "client": {
            "maxLength": 100,
            "minLength": 1,
            "title": "Client",
            "type": "string"
          },
          "agent": {
            "maxLength": 100,
            "minLength": 1,
            "title": "Agent",
            "type": "string"
          },
          "tool": {
            "anyOf": [
              {
                "maxLength": 100,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Tool"
          }
        },
        "required": [
          "application",
          "client",
          "agent",
          "tool"
        ],
        "title": "Versions",
        "type": "object"
      }
    },
    "additionalProperties": false,
    "properties": {
      "operation_request_id": {
        "format": "uuid",
        "title": "Operation Request Id",
        "type": "string"
      },
      "confirmation_id": {
        "format": "uuid",
        "title": "Confirmation Id",
        "type": "string"
      },
      "preview_hash": {
        "pattern": "^[a-f0-9]{64}$",
        "title": "Preview Hash",
        "type": "string"
      },
      "challenge": {
        "maxLength": 100,
        "minLength": 1,
        "title": "Challenge",
        "type": "string"
      },
      "payload": {
        "anyOf": [
          {
            "$ref": "#/$defs/KnowledgePayload"
          },
          {
            "$ref": "#/$defs/FeedbackPayload"
          }
        ],
        "title": "Payload"
      }
    },
    "required": [
      "operation_request_id",
      "confirmation_id",
      "preview_hash",
      "challenge",
      "payload"
    ],
    "title": "ConfirmDesktop",
    "type": "object"
  }
} as const
export const knownProhibitedPattern = "-----BEGIN [^-]*PRIVATE KEY-----|sk-proj-[a-zA-Z0-9_-]{16,}|authorization\\s*:\\s*bearer"
