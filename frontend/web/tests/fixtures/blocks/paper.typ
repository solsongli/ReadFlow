#set page(paper:"a4", margin:20mm, header:align(center)[ReadFlow Synthetic Research], footer:align(center)[Study · #context counter(page).display()])
#set text(font:("Source Han Serif SC","Noto Serif CJK SC"),size:10pt)
#align(center)[#text(size:19pt,weight:"bold")[Safe Research with Document Blocks]]
#align(center)[Alice Zhang; Bob Li]
#align(center)[Laboratory of Reproducible Research]
#v(8pt)
#columns(2,gutter:15pt)[
  *Abstract* \ This synthetic paper evaluates block translation. It contains protected inline mathematics $alpha + beta = gamma$, references [1], and images.
  = 1 Introduction
  Block translation should preserve evidence and reading order. The original document is retained. We examine reproducible analysis and scientific reasoning in two columns.
  #for i in range(8) [
    The method uses paragraph-level evidence and a stable document identity. A useful value is $x_i^2 + y_i^2$ and we compare results with [1–2]. No real model is used in this fixture.

  ]
  == 1.1 Method
  The numbered equation is retained as vector content.
  #math.equation(block:true, numbering:"(1)", $E = m c^2$)
  #figure(rect(width:100%,height:50pt,fill:rgb("dbeaff"))[Vector method diagram], caption:[A vector method overview.])
  #figure(image("../paper-image.png",width:75%),caption:[A bitmap measurement.])
  #figure(table(columns:2,[Method],[Accuracy],[Baseline],[0.8],[ReadFlow],[0.9]),kind:table,caption:[Measured results.])
  = 2 Results
  - Keep source evidence.
  - Review translated blocks.
  #for i in range(25) [
    Reliable evaluation requires repeated experiments. We use twenty observations and preserve mathematical symbols $sigma^2$ in the translated prose. The results support the method.

  ]
  #footnote[#text(size:7pt)[This is a footnote with contextual evidence.]]
  = References
  \[1\] Zhang, A. Reproducible research methods. Journal of Examples, 2025.

  \[2\] Li, B. Block structure and readable translation. Test Proceedings, 2026.
]
