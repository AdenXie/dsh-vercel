# 当前会话 Vercel App 工具目录

审计日期：2026-10-19。截图显示 236 项（91 write / 145 read）；本会话实际可见 235 个工具定义。下表穷尽本轮可见项，不虚构缺少的第 236 项。235 项的 DSH 实际可用性均待授权后 tools/list 及调用验证；「预期 DSH 名」仅按当前桥接代码推导。CLI 提示不是命令测试结果。每项用途与 CLI 原文见同目录 JSON 快照。

工具分类依据 Vercel 官方 27 个分类页面，不根据函数名前缀推测读写权限。全部 235 项已归类，未出现抓取失败。没有调用下表中的写入工具。

## Access Groups（5 项）

[官方分类](https://vercel.com/docs/agent-resources/vercel-mcp/tools/access-groups)

| 工具 | 预期 DSH 注册名 | CLI 备用提示 | DSH 覆盖结论 |
| --- | --- | --- | --- |
| `list_access_group_members` | `mcp__vercel__list_access_group_members` | 有，未实测 | 待真实工具清单验证 |
| `list_access_group_projects` | `mcp__vercel__list_access_group_projects` | 有，未实测 | 待真实工具清单验证 |
| `list_access_groups` | `mcp__vercel__list_access_groups` | 有，未实测 | 待真实工具清单验证 |
| `read_access_group` | `mcp__vercel__read_access_group` | 有，未实测 | 待真实工具清单验证 |
| `read_access_group_project` | `mcp__vercel__read_access_group_project` | 有，未实测 | 待真实工具清单验证 |

## Agent Runs（4 项）

[官方分类](https://vercel.com/docs/agent-resources/vercel-mcp/tools/agent-runs)

| 工具 | 预期 DSH 注册名 | CLI 备用提示 | DSH 覆盖结论 |
| --- | --- | --- | --- |
| `get_agent_run` | `mcp__vercel__get_agent_run` | 有，未实测 | 待真实工具清单验证 |
| `get_agent_run_trace` | `mcp__vercel__get_agent_run_trace` | 有，未实测 | 待真实工具清单验证 |
| `list_agent_run_projects` | `mcp__vercel__list_agent_run_projects` | 有，未实测 | 待真实工具清单验证 |
| `list_agent_runs` | `mcp__vercel__list_agent_runs` | 有，未实测 | 待真实工具清单验证 |

## Billing and Purchases（5 项）

[官方分类](https://vercel.com/docs/agent-resources/vercel-mcp/tools/billing)

| 工具 | 预期 DSH 注册名 | CLI 备用提示 | DSH 覆盖结论 |
| --- | --- | --- | --- |
| `buy_domain` | `mcp__vercel__buy_domain` | 明确无 | 待真实工具清单验证 |
| `get_domain_order` | `mcp__vercel__get_domain_order` | 明确无 | 待真实工具清单验证 |
| `get_purchase_quote` | `mcp__vercel__get_purchase_quote` | 明确无 | 待真实工具清单验证 |
| `list_billing_charges` | `mcp__vercel__list_billing_charges` | 有，未实测 | 待真实工具清单验证 |
| `list_contract_commitments` | `mcp__vercel__list_contract_commitments` | 有，未实测 | 待真实工具清单验证 |

## Caching（6 项）

[官方分类](https://vercel.com/docs/agent-resources/vercel-mcp/tools/caching)

| 工具 | 预期 DSH 注册名 | CLI 备用提示 | DSH 覆盖结论 |
| --- | --- | --- | --- |
| `artifact_query` | `mcp__vercel__artifact_query` | 有，未实测 | 待真实工具清单验证 |
| `get_remote_cache_status` | `mcp__vercel__get_remote_cache_status` | 有，未实测 | 待真实工具清单验证 |
| `invalidate_by_src_images` | `mcp__vercel__invalidate_by_src_images` | 有，未实测 | 待真实工具清单验证 |
| `invalidate_by_tags` | `mcp__vercel__invalidate_by_tags` | 有，未实测 | 待真实工具清单验证 |
| `record_events` | `mcp__vercel__record_events` | 有，未实测 | 待真实工具清单验证 |
| `upload_artifact` | `mcp__vercel__upload_artifact` | 明确无 | 待真实工具清单验证 |

## Checks（1 项）

[官方分类](https://vercel.com/docs/agent-resources/vercel-mcp/tools/checks)

| 工具 | 预期 DSH 注册名 | CLI 备用提示 | DSH 覆盖结论 |
| --- | --- | --- | --- |
| `rerequest_check` | `mcp__vercel__rerequest_check` | 有，未实测 | 待真实工具清单验证 |

## Deployments（14 项）

[官方分类](https://vercel.com/docs/agent-resources/vercel-mcp/tools/deployments)

| 工具 | 预期 DSH 注册名 | CLI 备用提示 | DSH 覆盖结论 |
| --- | --- | --- | --- |
| `cancel_deployment` | `mcp__vercel__cancel_deployment` | 有，未实测 | 待真实工具清单验证 |
| `create_deployment` | `mcp__vercel__create_deployment` | 有，未实测 | 待真实工具清单验证 |
| `get_access_to_vercel_url` | `mcp__vercel__get_access_to_vercel_url` | 明确无 | 待真实工具清单验证 |
| `get_deployment` | `mcp__vercel__get_deployment` | 有，未实测 | 待真实工具清单验证 |
| `get_deployment_feature_flags` | `mcp__vercel__get_deployment_feature_flags` | 有，未实测 | 待真实工具清单验证 |
| `get_deployment_file_contents` | `mcp__vercel__get_deployment_file_contents` | 有，未实测 | 待真实工具清单验证 |
| `get_git_deployment_context` | `mcp__vercel__get_git_deployment_context` | 明确无 | 待真实工具清单验证 |
| `import_claude_design_from_url` | `mcp__vercel__import_claude_design_from_url` | 明确无 | 待真实工具清单验证 |
| `list_deployment_events` | `mcp__vercel__list_deployment_events` | 有，未实测 | 待真实工具清单验证 |
| `list_deployment_files` | `mcp__vercel__list_deployment_files` | 有，未实测 | 待真实工具清单验证 |
| `list_deployments` | `mcp__vercel__list_deployments` | 有，未实测 | 待真实工具清单验证 |
| `open_deployments` | `mcp__vercel__open_deployments` | 明确无 | 待真实工具清单验证 |
| `upload_file` | `mcp__vercel__upload_file` | 明确无 | 待真实工具清单验证 |
| `web_fetch_vercel_url` | `mcp__vercel__web_fetch_vercel_url` | 明确无 | 待真实工具清单验证 |

## Documentation and CLI（1 项）

[官方分类](https://vercel.com/docs/agent-resources/vercel-mcp/tools/documentation)

| 工具 | 预期 DSH 注册名 | CLI 备用提示 | DSH 覆盖结论 |
| --- | --- | --- | --- |
| `search_vercel_documentation` | `mcp__vercel__search_vercel_documentation` | 明确无 | 待真实工具清单验证 |

## Domains and DNS（24 项）

[官方分类](https://vercel.com/docs/agent-resources/vercel-mcp/tools/domains)

| 工具 | 预期 DSH 注册名 | CLI 备用提示 | DSH 覆盖结论 |
| --- | --- | --- | --- |
| `create_or_transfer_domain` | `mcp__vercel__create_or_transfer_domain` | 有，未实测 | 待真实工具清单验证 |
| `get_bulk_availability` | `mcp__vercel__get_bulk_availability` | 有，未实测 | 待真实工具清单验证 |
| `get_bulk_price` | `mcp__vercel__get_bulk_price` | 有，未实测 | 待真实工具清单验证 |
| `get_cert_by_id` | `mcp__vercel__get_cert_by_id` | 有，未实测 | 待真实工具清单验证 |
| `get_contact_info_schema` | `mcp__vercel__get_contact_info_schema` | 有，未实测 | 待真实工具清单验证 |
| `get_domain` | `mcp__vercel__get_domain` | 有，未实测 | 待真实工具清单验证 |
| `get_domain_availability` | `mcp__vercel__get_domain_availability` | 有，未实测 | 待真实工具清单验证 |
| `get_domain_config` | `mcp__vercel__get_domain_config` | 有，未实测 | 待真实工具清单验证 |
| `get_domain_contact_verification` | `mcp__vercel__get_domain_contact_verification` | 有，未实测 | 待真实工具清单验证 |
| `get_domain_price` | `mcp__vercel__get_domain_price` | 有，未实测 | 待真实工具清单验证 |
| `get_domain_project_domains` | `mcp__vercel__get_domain_project_domains` | 有，未实测 | 待真实工具清单验证 |
| `get_domain_verification_record` | `mcp__vercel__get_domain_verification_record` | 有，未实测 | 待真实工具清单验证 |
| `get_domains_records_by_record_id` | `mcp__vercel__get_domains_records_by_record_id` | 有，未实测 | 待真实工具清单验证 |
| `get_order` | `mcp__vercel__get_order` | 有，未实测 | 待真实工具清单验证 |
| `get_records` | `mcp__vercel__get_records` | 有，未实测 | 待真实工具清单验证 |
| `get_tld` | `mcp__vercel__get_tld` | 有，未实测 | 待真实工具清单验证 |
| `get_tld_price` | `mcp__vercel__get_tld_price` | 有，未实测 | 待真实工具清单验证 |
| `issue_cert` | `mcp__vercel__issue_cert` | 有，未实测 | 待真实工具清单验证 |
| `list_certs` | `mcp__vercel__list_certs` | 有，未实测 | 待真实工具清单验证 |
| `list_domains` | `mcp__vercel__list_domains` | 有，未实测 | 待真实工具清单验证 |
| `list_supported_tlds` | `mcp__vercel__list_supported_tlds` | 有，未实测 | 待真实工具清单验证 |
| `replace_domain_dns_records` | `mcp__vercel__replace_domain_dns_records` | 有，未实测 | 待真实工具清单验证 |
| `search_domains` | `mcp__vercel__search_domains` | 有，未实测 | 待真实工具清单验证 |
| `update_record` | `mcp__vercel__update_record` | 有，未实测 | 待真实工具清单验证 |

## Drains（5 项）

[官方分类](https://vercel.com/docs/agent-resources/vercel-mcp/tools/drains)

| 工具 | 预期 DSH 注册名 | CLI 备用提示 | DSH 覆盖结论 |
| --- | --- | --- | --- |
| `create_drain` | `mcp__vercel__create_drain` | 有，未实测 | 待真实工具清单验证 |
| `get_drain` | `mcp__vercel__get_drain` | 有，未实测 | 待真实工具清单验证 |
| `list_drains` | `mcp__vercel__list_drains` | 有，未实测 | 待真实工具清单验证 |
| `test_drain` | `mcp__vercel__test_drain` | 有，未实测 | 待真实工具清单验证 |
| `update_drain` | `mcp__vercel__update_drain` | 有，未实测 | 待真实工具清单验证 |

## Environment Variables（7 项）

[官方分类](https://vercel.com/docs/agent-resources/vercel-mcp/tools/environment-variables)

| 工具 | 预期 DSH 注册名 | CLI 备用提示 | DSH 覆盖结论 |
| --- | --- | --- | --- |
| `create_project_env` | `mcp__vercel__create_project_env` | 有，未实测 | 待真实工具清单验证 |
| `edit_project_env` | `mcp__vercel__edit_project_env` | 有，未实测 | 待真实工具清单验证 |
| `filter_project_envs` | `mcp__vercel__filter_project_envs` | 有，未实测 | 待真实工具清单验证 |
| `get_custom_environment` | `mcp__vercel__get_custom_environment` | 有，未实测 | 待真实工具清单验证 |
| `get_project_env` | `mcp__vercel__get_project_env` | 有，未实测 | 待真实工具清单验证 |
| `get_shared_env_var` | `mcp__vercel__get_shared_env_var` | 有，未实测 | 待真实工具清单验证 |
| `list_project_custom_environments` | `mcp__vercel__list_project_custom_environments` | 有，未实测 | 待真实工具清单验证 |

## Feature Flags（16 项）

[官方分类](https://vercel.com/docs/agent-resources/vercel-mcp/tools/feature-flags)

| 工具 | 预期 DSH 注册名 | CLI 备用提示 | DSH 覆盖结论 |
| --- | --- | --- | --- |
| `create_flag` | `mcp__vercel__create_flag` | 有，未实测 | 待真实工具清单验证 |
| `create_sdk_key` | `mcp__vercel__create_sdk_key` | 有，未实测 | 待真实工具清单验证 |
| `get_flag` | `mcp__vercel__get_flag` | 有，未实测 | 待真实工具清单验证 |
| `get_flag_segment` | `mcp__vercel__get_flag_segment` | 有，未实测 | 待真实工具清单验证 |
| `get_flag_settings` | `mcp__vercel__get_flag_settings` | 有，未实测 | 待真实工具清单验证 |
| `list_feature_flag_sdk_keys` | `mcp__vercel__list_feature_flag_sdk_keys` | 有，未实测 | 待真实工具清单验证 |
| `list_flag_segments` | `mcp__vercel__list_flag_segments` | 有，未实测 | 待真实工具清单验证 |
| `list_flag_versions` | `mcp__vercel__list_flag_versions` | 有，未实测 | 待真实工具清单验证 |
| `list_flags` | `mcp__vercel__list_flags` | 有，未实测 | 待真实工具清单验证 |
| `list_flags_v2` | `mcp__vercel__list_flags_v2` | 有，未实测 | 待真实工具清单验证 |
| `list_team_flag_settings` | `mcp__vercel__list_team_flag_settings` | 有，未实测 | 待真实工具清单验证 |
| `list_team_flags` | `mcp__vercel__list_team_flags` | 有，未实测 | 待真实工具清单验证 |
| `list_team_flags_v2` | `mcp__vercel__list_team_flags_v2` | 有，未实测 | 待真实工具清单验证 |
| `update_flag` | `mcp__vercel__update_flag` | 有，未实测 | 待真实工具清单验证 |
| `update_flag_segment` | `mcp__vercel__update_flag_segment` | 有，未实测 | 待真实工具清单验证 |
| `update_flag_settings` | `mcp__vercel__update_flag_settings` | 有，未实测 | 待真实工具清单验证 |

## Firewall and Security（6 项）

[官方分类](https://vercel.com/docs/agent-resources/vercel-mcp/tools/firewall)

| 工具 | 预期 DSH 注册名 | CLI 备用提示 | DSH 覆盖结论 |
| --- | --- | --- | --- |
| `get_active_attack_status` | `mcp__vercel__get_active_attack_status` | 有，未实测 | 待真实工具清单验证 |
| `get_bypass_ip` | `mcp__vercel__get_bypass_ip` | 有，未实测 | 待真实工具清单验证 |
| `get_firewall_config` | `mcp__vercel__get_firewall_config` | 有，未实测 | 待真实工具清单验证 |
| `put_firewall_config` | `mcp__vercel__put_firewall_config` | 有，未实测 | 待真实工具清单验证 |
| `update_attack_challenge_mode` | `mcp__vercel__update_attack_challenge_mode` | 有，未实测 | 待真实工具清单验证 |
| `update_firewall_config` | `mcp__vercel__update_firewall_config` | 有，未实测 | 待真实工具清单验证 |

## Global Config（12 项）

[官方分类](https://vercel.com/docs/agent-resources/vercel-mcp/tools/global-config)

| 工具 | 预期 DSH 注册名 | CLI 备用提示 | DSH 覆盖结论 |
| --- | --- | --- | --- |
| `create_edge_config` | `mcp__vercel__create_edge_config` | 有，未实测 | 待真实工具清单验证 |
| `create_edge_config_token` | `mcp__vercel__create_edge_config_token` | 有，未实测 | 待真实工具清单验证 |
| `get_edge_config` | `mcp__vercel__get_edge_config` | 有，未实测 | 待真实工具清单验证 |
| `get_edge_config_backup` | `mcp__vercel__get_edge_config_backup` | 有，未实测 | 待真实工具清单验证 |
| `get_edge_config_backups` | `mcp__vercel__get_edge_config_backups` | 有，未实测 | 待真实工具清单验证 |
| `get_edge_config_item` | `mcp__vercel__get_edge_config_item` | 有，未实测 | 待真实工具清单验证 |
| `get_edge_config_items` | `mcp__vercel__get_edge_config_items` | 有，未实测 | 待真实工具清单验证 |
| `get_edge_config_tokens` | `mcp__vercel__get_edge_config_tokens` | 有，未实测 | 待真实工具清单验证 |
| `get_edge_configs` | `mcp__vercel__get_edge_configs` | 有，未实测 | 待真实工具清单验证 |
| `patch_edge_config_items` | `mcp__vercel__patch_edge_config_items` | 有，未实测 | 待真实工具清单验证 |
| `restore_edge_config_backup` | `mcp__vercel__restore_edge_config_backup` | 有，未实测 | 待真实工具清单验证 |
| `update_edge_config` | `mcp__vercel__update_edge_config` | 有，未实测 | 待真实工具清单验证 |

## Integrations（6 项）

[官方分类](https://vercel.com/docs/agent-resources/vercel-mcp/tools/integrations)

| 工具 | 预期 DSH 注册名 | CLI 备用提示 | DSH 覆盖结论 |
| --- | --- | --- | --- |
| `get_configuration` | `mcp__vercel__get_configuration` | 有，未实测 | 待真实工具清单验证 |
| `get_webhooks` | `mcp__vercel__get_webhooks` | 有，未实测 | 待真实工具清单验证 |
| `list_integration_billing_plans` | `mcp__vercel__list_integration_billing_plans` | 有，未实测 | 待真实工具清单验证 |
| `list_integration_configuration_products` | `mcp__vercel__list_integration_configuration_products` | 有，未实测 | 待真实工具清单验证 |
| `list_integration_configurations` | `mcp__vercel__list_integration_configurations` | 有，未实测 | 待真实工具清单验证 |
| `search_repo` | `mcp__vercel__search_repo` | 有，未实测 | 待真实工具清单验证 |

## Key Management（9 项）

[官方分类](https://vercel.com/docs/agent-resources/vercel-mcp/tools/key-management)

| 工具 | 预期 DSH 注册名 | CLI 备用提示 | DSH 覆盖结论 |
| --- | --- | --- | --- |
| `activate_kms_signing_key` | `mcp__vercel__activate_kms_signing_key` | 有，未实测 | 待真实工具清单验证 |
| `create_kms_issuer` | `mcp__vercel__create_kms_issuer` | 有，未实测 | 待真实工具清单验证 |
| `create_kms_issuer_policy` | `mcp__vercel__create_kms_issuer_policy` | 有，未实测 | 待真实工具清单验证 |
| `create_kms_signing_key` | `mcp__vercel__create_kms_signing_key` | 有，未实测 | 待真实工具清单验证 |
| `get_kms_issuer` | `mcp__vercel__get_kms_issuer` | 有，未实测 | 待真实工具清单验证 |
| `list_kms_issuers` | `mcp__vercel__list_kms_issuers` | 有，未实测 | 待真实工具清单验证 |
| `revoke_kms_signing_key` | `mcp__vercel__revoke_kms_signing_key` | 有，未实测 | 待真实工具清单验证 |
| `update_kms_issuer` | `mcp__vercel__update_kms_issuer` | 有，未实测 | 待真实工具清单验证 |
| `update_kms_issuer_policy` | `mcp__vercel__update_kms_issuer_policy` | 有，未实测 | 待真实工具清单验证 |

## Microfrontends（2 项）

[官方分类](https://vercel.com/docs/agent-resources/vercel-mcp/tools/microfrontends)

| 工具 | 预期 DSH 注册名 | CLI 备用提示 | DSH 覆盖结论 |
| --- | --- | --- | --- |
| `get_microfrontends_config` | `mcp__vercel__get_microfrontends_config` | 有，未实测 | 待真实工具清单验证 |
| `get_microfrontends_config_for_project` | `mcp__vercel__get_microfrontends_config_for_project` | 有，未实测 | 待真实工具清单验证 |

## Networking（7 项）

[官方分类](https://vercel.com/docs/agent-resources/vercel-mcp/tools/networking)

| 工具 | 预期 DSH 注册名 | CLI 备用提示 | DSH 覆盖结论 |
| --- | --- | --- | --- |
| `get_connector` | `mcp__vercel__get_connector` | 有，未实测 | 待真实工具清单验证 |
| `get_connector_project_connection` | `mcp__vercel__get_connector_project_connection` | 有，未实测 | 待真实工具清单验证 |
| `list_connector_project_connections` | `mcp__vercel__list_connector_project_connections` | 有，未实测 | 待真实工具清单验证 |
| `list_connectors` | `mcp__vercel__list_connectors` | 有，未实测 | 待真实工具清单验证 |
| `list_project_connector_connections` | `mcp__vercel__list_project_connector_connections` | 有，未实测 | 待真实工具清单验证 |
| `update_connector` | `mcp__vercel__update_connector` | 有，未实测 | 待真实工具清单验证 |
| `upsert_connector_project_connection` | `mcp__vercel__upsert_connector_project_connection` | 有，未实测 | 待真实工具清单验证 |

## Observability（7 项）

[官方分类](https://vercel.com/docs/agent-resources/vercel-mcp/tools/observability)

| 工具 | 预期 DSH 注册名 | CLI 备用提示 | DSH 覆盖结论 |
| --- | --- | --- | --- |
| `create_observability_query` | `mcp__vercel__create_observability_query` | 有，未实测 | 待真实工具清单验证 |
| `create_trace_session` | `mcp__vercel__create_trace_session` | 有，未实测 | 待真实工具清单验证 |
| `get_observability_configuration_projects` | `mcp__vercel__get_observability_configuration_projects` | 有，未实测 | 待真实工具清单验证 |
| `get_observability_schema` | `mcp__vercel__get_observability_schema` | 有，未实测 | 待真实工具清单验证 |
| `get_project_trace` | `mcp__vercel__get_project_trace` | 有，未实测 | 待真实工具清单验证 |
| `get_runtime_errors` | `mcp__vercel__get_runtime_errors` | 有，未实测 | 待真实工具清单验证 |
| `get_runtime_logs` | `mcp__vercel__get_runtime_logs` | 有，未实测 | 待真实工具清单验证 |

## Projects（15 项）

[官方分类](https://vercel.com/docs/agent-resources/vercel-mcp/tools/projects)

| 工具 | 预期 DSH 注册名 | CLI 备用提示 | DSH 覆盖结论 |
| --- | --- | --- | --- |
| `accept_project_transfer_request` | `mcp__vercel__accept_project_transfer_request` | 有，未实测 | 待真实工具清单验证 |
| `add_project_domain` | `mcp__vercel__add_project_domain` | 有，未实测 | 待真实工具清单验证 |
| `create_git_project` | `mcp__vercel__create_git_project` | 明确无 | 待真实工具清单验证 |
| `create_project` | `mcp__vercel__create_project` | 有，未实测 | 待真实工具清单验证 |
| `get_project` | `mcp__vercel__get_project` | 有，未实测 | 待真实工具清单验证 |
| `get_project_deletion_link` | `mcp__vercel__get_project_deletion_link` | 明确无 | 待真实工具清单验证 |
| `get_project_domain` | `mcp__vercel__get_project_domain` | 有，未实测 | 待真实工具清单验证 |
| `git_namespaces` | `mcp__vercel__git_namespaces` | 有，未实测 | 待真实工具清单验证 |
| `list_project_domains` | `mcp__vercel__list_project_domains` | 有，未实测 | 待真实工具清单验证 |
| `list_projects` | `mcp__vercel__list_projects` | 有，未实测 | 待真实工具清单验证 |
| `pause_project` | `mcp__vercel__pause_project` | 有，未实测 | 待真实工具清单验证 |
| `unpause_project` | `mcp__vercel__unpause_project` | 有，未实测 | 待真实工具清单验证 |
| `update_project` | `mcp__vercel__update_project` | 有，未实测 | 待真实工具清单验证 |
| `update_project_protection_bypass` | `mcp__vercel__update_project_protection_bypass` | 有，未实测 | 待真实工具清单验证 |
| `verify_project_domain` | `mcp__vercel__verify_project_domain` | 有，未实测 | 待真实工具清单验证 |

## Rolling Releases（10 项）

[官方分类](https://vercel.com/docs/agent-resources/vercel-mcp/tools/rolling-releases)

| 工具 | 预期 DSH 注册名 | CLI 备用提示 | DSH 覆盖结论 |
| --- | --- | --- | --- |
| `approve_rolling_release_stage` | `mcp__vercel__approve_rolling_release_stage` | 有，未实测 | 待真实工具清单验证 |
| `complete_rolling_release` | `mcp__vercel__complete_rolling_release` | 有，未实测 | 待真实工具清单验证 |
| `get_rolling_release` | `mcp__vercel__get_rolling_release` | 有，未实测 | 待真实工具清单验证 |
| `get_rolling_release_billing_status` | `mcp__vercel__get_rolling_release_billing_status` | 有，未实测 | 待真实工具清单验证 |
| `get_rolling_release_config` | `mcp__vercel__get_rolling_release_config` | 有，未实测 | 待真实工具清单验证 |
| `list_promote_aliases` | `mcp__vercel__list_promote_aliases` | 有，未实测 | 待真实工具清单验证 |
| `request_promote` | `mcp__vercel__request_promote` | 有，未实测 | 待真实工具清单验证 |
| `request_rollback` | `mcp__vercel__request_rollback` | 有，未实测 | 待真实工具清单验证 |
| `start_rolling_release` | `mcp__vercel__start_rolling_release` | 有，未实测 | 待真实工具清单验证 |
| `update_rolling_release_config` | `mcp__vercel__update_rolling_release_config` | 有，未实测 | 待真实工具清单验证 |

## Routing（17 项）

[官方分类](https://vercel.com/docs/agent-resources/vercel-mcp/tools/routing)

| 工具 | 预期 DSH 注册名 | CLI 备用提示 | DSH 覆盖结论 |
| --- | --- | --- | --- |
| `add_route` | `mcp__vercel__add_route` | 有，未实测 | 待真实工具清单验证 |
| `assign_alias` | `mcp__vercel__assign_alias` | 有，未实测 | 待真实工具清单验证 |
| `edit_route` | `mcp__vercel__edit_route` | 有，未实测 | 待真实工具清单验证 |
| `generate_route` | `mcp__vercel__generate_route` | 有，未实测 | 待真实工具清单验证 |
| `get_alias` | `mcp__vercel__get_alias` | 有，未实测 | 待真实工具清单验证 |
| `list_aliases` | `mcp__vercel__list_aliases` | 有，未实测 | 待真实工具清单验证 |
| `list_bulk_redirect_versions` | `mcp__vercel__list_bulk_redirect_versions` | 有，未实测 | 待真实工具清单验证 |
| `list_bulk_redirects` | `mcp__vercel__list_bulk_redirects` | 有，未实测 | 待真实工具清单验证 |
| `list_deployment_aliases` | `mcp__vercel__list_deployment_aliases` | 有，未实测 | 待真实工具清单验证 |
| `list_project_route_versions` | `mcp__vercel__list_project_route_versions` | 有，未实测 | 待真实工具清单验证 |
| `list_project_routes` | `mcp__vercel__list_project_routes` | 有，未实测 | 待真实工具清单验证 |
| `patch_url_protection_bypass` | `mcp__vercel__patch_url_protection_bypass` | 有，未实测 | 待真实工具清单验证 |
| `restore_redirects` | `mcp__vercel__restore_redirects` | 有，未实测 | 待真实工具清单验证 |
| `stage_redirects` | `mcp__vercel__stage_redirects` | 有，未实测 | 待真实工具清单验证 |
| `stage_routes` | `mcp__vercel__stage_routes` | 有，未实测 | 待真实工具清单验证 |
| `update_bulk_redirect_version` | `mcp__vercel__update_bulk_redirect_version` | 有，未实测 | 待真实工具清单验证 |
| `update_route_versions` | `mcp__vercel__update_route_versions` | 有，未实测 | 待真实工具清单验证 |

## Sandboxes（23 项）

[官方分类](https://vercel.com/docs/agent-resources/vercel-mcp/tools/sandboxes)

| 工具 | 预期 DSH 注册名 | CLI 备用提示 | DSH 覆盖结论 |
| --- | --- | --- | --- |
| `create_sandboxes_sessions_by_session_id_snapshot_v2` | `mcp__vercel__create_sandboxes_sessions_by_session_id_snapshot_v2` | 有，未实测 | 待真实工具清单验证 |
| `create_sandboxes_sessions_by_session_id_snapshot_v3` | `mcp__vercel__create_sandboxes_sessions_by_session_id_snapshot_v3` | 有，未实测 | 待真实工具清单验证 |
| `create_sandboxes_v2` | `mcp__vercel__create_sandboxes_v2` | 有，未实测 | 待真实工具清单验证 |
| `create_sandboxes_v3` | `mcp__vercel__create_sandboxes_v3` | 有，未实测 | 待真实工具清单验证 |
| `create_sandboxes_v4` | `mcp__vercel__create_sandboxes_v4` | 有，未实测 | 待真实工具清单验证 |
| `create_session_directory` | `mcp__vercel__create_session_directory` | 有，未实测 | 待真实工具清单验证 |
| `extend_session_timeout` | `mcp__vercel__extend_session_timeout` | 有，未实测 | 待真实工具清单验证 |
| `get_named_sandbox` | `mcp__vercel__get_named_sandbox` | 有，未实测 | 待真实工具清单验证 |
| `get_session` | `mcp__vercel__get_session` | 有，未实测 | 待真实工具清单验证 |
| `get_session_command` | `mcp__vercel__get_session_command` | 有，未实测 | 待真实工具清单验证 |
| `get_session_command_logs` | `mcp__vercel__get_session_command_logs` | 有，未实测 | 待真实工具清单验证 |
| `get_session_snapshot` | `mcp__vercel__get_session_snapshot` | 有，未实测 | 待真实工具清单验证 |
| `kill_session_command` | `mcp__vercel__kill_session_command` | 有，未实测 | 待真实工具清单验证 |
| `list_named_sandboxes` | `mcp__vercel__list_named_sandboxes` | 有，未实测 | 待真实工具清单验证 |
| `list_session_commands` | `mcp__vercel__list_session_commands` | 有，未实测 | 待真实工具清单验证 |
| `list_session_snapshots` | `mcp__vercel__list_session_snapshots` | 有，未实测 | 待真实工具清单验证 |
| `list_sessions` | `mcp__vercel__list_sessions` | 有，未实测 | 待真实工具清单验证 |
| `read_session_file` | `mcp__vercel__read_session_file` | 明确无 | 待真实工具清单验证 |
| `run_session_command` | `mcp__vercel__run_session_command` | 有，未实测 | 待真实工具清单验证 |
| `stop_session` | `mcp__vercel__stop_session` | 有，未实测 | 待真实工具清单验证 |
| `update_sandbox` | `mcp__vercel__update_sandbox` | 有，未实测 | 待真实工具清单验证 |
| `update_session_network_policy` | `mcp__vercel__update_session_network_policy` | 有，未实测 | 待真实工具清单验证 |
| `write_session_files` | `mcp__vercel__write_session_files` | 明确无 | 待真实工具清单验证 |

## Storage（2 项）

[官方分类](https://vercel.com/docs/agent-resources/vercel-mcp/tools/storage)

| 工具 | 预期 DSH 注册名 | CLI 备用提示 | DSH 覆盖结论 |
| --- | --- | --- | --- |
| `create_storage_stores_blob` | `mcp__vercel__create_storage_stores_blob` | 有，未实测 | 待真实工具清单验证 |
| `get_storage_stores_by_id` | `mcp__vercel__get_storage_stores_by_id` | 有，未实测 | 待真实工具清单验证 |

## Teams and Users（6 项）

[官方分类](https://vercel.com/docs/agent-resources/vercel-mcp/tools/teams)

| 工具 | 预期 DSH 注册名 | CLI 备用提示 | DSH 覆盖结论 |
| --- | --- | --- | --- |
| `get_auth_user` | `mcp__vercel__get_auth_user` | 有，未实测 | 待真实工具清单验证 |
| `get_team` | `mcp__vercel__get_team` | 有，未实测 | 待真实工具清单验证 |
| `list_event_types` | `mcp__vercel__list_event_types` | 有，未实测 | 待真实工具清单验证 |
| `list_team_members` | `mcp__vercel__list_team_members` | 有，未实测 | 待真实工具清单验证 |
| `list_teams` | `mcp__vercel__list_teams` | 有，未实测 | 待真实工具清单验证 |
| `list_user_events` | `mcp__vercel__list_user_events` | 有，未实测 | 待真实工具清单验证 |

## Toolbar（6 项）

[官方分类](https://vercel.com/docs/agent-resources/vercel-mcp/tools/toolbar)

| 工具 | 预期 DSH 注册名 | CLI 备用提示 | DSH 覆盖结论 |
| --- | --- | --- | --- |
| `add_toolbar_reaction` | `mcp__vercel__add_toolbar_reaction` | 明确无 | 待真实工具清单验证 |
| `change_toolbar_thread_resolve_status` | `mcp__vercel__change_toolbar_thread_resolve_status` | 明确无 | 待真实工具清单验证 |
| `edit_toolbar_message` | `mcp__vercel__edit_toolbar_message` | 有，未实测 | 待真实工具清单验证 |
| `get_toolbar_thread` | `mcp__vercel__get_toolbar_thread` | 有，未实测 | 待真实工具清单验证 |
| `list_toolbar_threads` | `mcp__vercel__list_toolbar_threads` | 有，未实测 | 待真实工具清单验证 |
| `reply_to_toolbar_thread` | `mcp__vercel__reply_to_toolbar_thread` | 有，未实测 | 待真实工具清单验证 |

## Vercel CI（15 项）

[官方分类](https://vercel.com/docs/agent-resources/vercel-mcp/tools/vercel-ci)

| 工具 | 预期 DSH 注册名 | CLI 备用提示 | DSH 覆盖结论 |
| --- | --- | --- | --- |
| `get_vercel_ci_invocation` | `mcp__vercel__get_vercel_ci_invocation` | 有，未实测 | 待真实工具清单验证 |
| `get_vercel_ci_invocation_logs` | `mcp__vercel__get_vercel_ci_invocation_logs` | 有，未实测 | 待真实工具清单验证 |
| `get_vercel_ci_invocation_tree` | `mcp__vercel__get_vercel_ci_invocation_tree` | 有，未实测 | 待真实工具清单验证 |
| `get_vercel_ci_job_definition` | `mcp__vercel__get_vercel_ci_job_definition` | 有，未实测 | 待真实工具清单验证 |
| `get_vercel_ci_job_run` | `mcp__vercel__get_vercel_ci_job_run` | 有，未实测 | 待真实工具清单验证 |
| `get_vercel_ci_job_run_logs` | `mcp__vercel__get_vercel_ci_job_run_logs` | 有，未实测 | 待真实工具清单验证 |
| `get_vercel_ci_task_logs` | `mcp__vercel__get_vercel_ci_task_logs` | 有，未实测 | 待真实工具清单验证 |
| `get_vercel_ci_task_run_logs` | `mcp__vercel__get_vercel_ci_task_run_logs` | 有，未实测 | 待真实工具清单验证 |
| `list_vercel_ci_invocation_attempts` | `mcp__vercel__list_vercel_ci_invocation_attempts` | 有，未实测 | 待真实工具清单验证 |
| `list_vercel_ci_invocations` | `mcp__vercel__list_vercel_ci_invocations` | 有，未实测 | 待真实工具清单验证 |
| `list_vercel_ci_job_definitions` | `mcp__vercel__list_vercel_ci_job_definitions` | 有，未实测 | 待真实工具清单验证 |
| `list_vercel_ci_job_runs` | `mcp__vercel__list_vercel_ci_job_runs` | 有，未实测 | 待真实工具清单验证 |
| `list_vercel_ci_task_definitions` | `mcp__vercel__list_vercel_ci_task_definitions` | 有，未实测 | 待真实工具清单验证 |
| `list_vercel_ci_task_runs` | `mcp__vercel__list_vercel_ci_task_runs` | 有，未实测 | 待真实工具清单验证 |
| `retry_vercel_ci_invocation` | `mcp__vercel__retry_vercel_ci_invocation` | 有，未实测 | 待真实工具清单验证 |

## Web Analytics（4 项）

[官方分类](https://vercel.com/docs/agent-resources/vercel-mcp/tools/web-analytics)

| 工具 | 预期 DSH 注册名 | CLI 备用提示 | DSH 覆盖结论 |
| --- | --- | --- | --- |
| `aggregate_events` | `mcp__vercel__aggregate_events` | 有，未实测 | 待真实工具清单验证 |
| `aggregate_pageviews` | `mcp__vercel__aggregate_pageviews` | 有，未实测 | 待真实工具清单验证 |
| `count_events` | `mcp__vercel__count_events` | 有，未实测 | 待真实工具清单验证 |
| `count_pageviews` | `mcp__vercel__count_pageviews` | 有，未实测 | 待真实工具清单验证 |
