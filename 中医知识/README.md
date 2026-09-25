# 中医知识库资料采集

这里放公开资料原文、来源清单和采集脚本。

## 文件

- `document_sources.seed.json`：候选资料清单。后续想扩展主题时，复制一条记录改 `id`、`title`、`url`、`topic` 即可。
- `scripts/collect_docs.py`：批量下载、PDF/HTML轻量抽检、生成 `sources.json` 和 `来源审核清单.md`。
- `scripts/build_kb_chunks.py`：从 `sources.json` 抽取文本并生成知识库 JSONL 切片。
- `sources.json`：最近一次采集结果，含状态、SHA256、抽检备注。
- `来源审核清单.md`：给人工 review 用的表格。
- `extracted_text/`：抽取后的原始文本。
- `chunks/knowledge_chunks.jsonl`：可导入向量库的切片，每行一条 JSON。
- `chunks/chunk_report.md`：切片统计报告。

## 用法

在本目录运行：

```bash
python3 scripts/collect_docs.py
```

如果需要强制重新下载：

```bash
python3 scripts/collect_docs.py --force
```

建议新增资料时优先使用这些来源类型：国家卫健委、国家中医药管理局、WHO、国家高等教育智慧教育平台、中华医学会/中华期刊指南。不要把营销号、论坛、百科、公众号养生文作为知识库核心来源。

## 生成知识库切片

采集完成后运行：

```bash
python3 scripts/build_kb_chunks.py
```

默认每片约 900 字、重叠约 120 字。可以按需要调整：

```bash
python3 scripts/build_kb_chunks.py --chunk-size 700 --overlap 100
```

切片会保留标题、主题、来源机构、URL、本地文件、页码范围和内容哈希。建议导入前先看 `chunks/chunk_report.md`，再抽查 `chunks/knowledge_chunks.jsonl`。

## 导入 SenseLoop 后端知识库

如果要把筛选后的资料直接写入 SenseLoop 后端数据库，运行：

```bash
PYTHONPATH=backend backend/.venv/bin/python backend/scripts/import_tcm_knowledge.py
```

只预览筛选和切片数量，不入库：

```bash
PYTHONPATH=backend backend/.venv/bin/python backend/scripts/import_tcm_knowledge.py --dry-run
```

当前第一批导入策略：

- 优先导入国家卫健委食养指南、药食同源管理规定、中医诊断学教学大纲、失眠指南、膳食指南和健康素养资料。
- 暂缓全量导入 WHO 中医术语、WHO 传统医学战略、针灸实践基准等大部头资料，避免第一版检索噪声过大。
- 导入内容会写入 `knowledge_sources` 和 `knowledge_chunks`。
- 脚本可重复运行，会先删除自己上一次导入的 `kb-tcm-*` 来源和切片，再重新导入。
- 导入报告写入 `knowledge_import_report.json`。
