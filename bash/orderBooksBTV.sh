rm *.log
killall -s KILL node
npm run orderBooks token=aETH server $1 &> orderBooks-aETH.log &
npm run orderBooks token=bETH server $1 &> orderBooks-bETH.log &
npm run orderBooks token=aETH-M19 server $1 &> orderBooks-aETH-M19.log &
npm run orderBooks token=bETH-M19 server $1 &> orderBooks-bETH-M19.log &