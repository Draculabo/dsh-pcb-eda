#! /bin/bash
lsof -ti:3080 | xargs kill -9
npx @deepseek-ai/dsh plugin --profile web add /Users/admin/code/dsh-pcb-eda/packages/dsh-auth  
npx @deepseek-ai/dsh plugin --profile web add /Users/admin/code/dsh-pcb-eda/packages/dsh-artifacts  
npx @deepseek-ai/dsh plugin --profile web add /Users/admin/code/dsh-pcb-eda/packages/dsh-tool-part-search  
npx @deepseek-ai/dsh plugin --profile web add /Users/admin/code/dsh-pcb-eda/packages/dsh-tool-symbol-footprint
npx @deepseek-ai/dsh plugin --profile web add /Users/admin/code/dsh-pcb-eda/packages/dsh-tool-schematic-gen

npx @deepseek-ai/dsh web

