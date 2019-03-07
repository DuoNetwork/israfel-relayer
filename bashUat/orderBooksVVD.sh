rm *.log
killall -s KILL node
npm run orderBooks tokens=ETH-100P-3H,ETH-100C-3H server env=uat $1 &> orderBooks.ETH-100C-3H.log &