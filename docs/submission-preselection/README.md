# anker-SenseLoop 预选提交包

这个目录用于准备 Anker 黑客松预选阶段的初始提交材料。

## 推荐提交材料

| 材料 | 文件/目录 | 状态 |
| --- | --- | --- |
| 项目 README | ../../README.md | 已完成 |
| 项目概览 | ./项目概览.md | 已完成 |
| Demo 链接说明 | ./Demo链接与运行方式.md | 已完成，在线 Demo 已部署 |
| 代码仓库说明 | ./代码仓库说明.md | 已完成，GitHub 链接已补 |
| PPT 答辩材料 | ./deck/anker-SenseLoop-答辩材料.pptx | 已完成 |
| PDF 答辩材料 | ./deck/anker-SenseLoop-答辩材料.pdf | 已完成 |
| PPT 总览预览图 | ./deck/anker-SenseLoop-答辩材料-montage.png | 已完成 |
| 3 分钟演示视频脚本 | ./3分钟演示视频脚本.md | 已完成 |
| 当前实现边界 | ./当前实现边界说明.md | 已完成 |
| 24 小时现场开发计划 | ./24小时现场开发计划.md | 已完成 |
| Roadmap 路线图 | ./Roadmap路线图.md | 已完成 |
| 隐私与医疗边界 | ./隐私与医疗边界说明.md | 已完成 |
| 评委可能会问的问题 | ./评委可能会问的问题.md | 已完成，部分人工信息待补 |
| 系统架构图 | ./diagrams/系统架构图.md | 已完成，含 SVG/PNG 单图 |
| Logo / 项目封面图说明 | ./Logo与项目封面图.md | 已完成 SVG 版本 |
| Logo / 项目封面图文件 | ./brand/README.md | 已放入提交包 |
| Demo 二维码 | ./qrcode/README.md | 已生成 |
| 服务器部署说明 | ../deployment/服务器部署说明.md | 已完成 |
| 提交前检查表 | ./submission-ready/提交前检查表.md | 已完成 |
| 参赛补充 TODO | ./TODO-参赛提交补充清单.md | 持续维护 |
| 人工填写项 | ./submission-ready/人工填写项.md | 已完成 |
| 当前实现截图 | ./screenshots/README.md | 目录已建立，截图待补 |
| 演示视频文件 | ./video/README.md | 目录已建立，视频待录制 |

## 核心表达

观息 SenseLoop 不是普通睡眠 App，也不是普通智能手表。它用 Anker soundcore Work 作为夜间声音入口，把打鼾、咳嗽、起夜、环境噪声等身体信号，与用户画像、饮食、排便、舌苔、口气等信息结合，生成第二天可执行的饮食、运动和恢复建议。

当前原型验证的是：

```text
夜间声音 -> 身体信号理解 -> 晨间行动建议
```

未来演进为：

```text
soundcore Work 原型 -> SenseLoop Watch / Band / Pendant
```
