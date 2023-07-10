const puppeteer = require('puppeteer')
const admin = require('firebase-admin')

// Firebase 설정
const serviceAccount = require('./serviceAccountKey.json')
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://mlb-management-default-rtdb.firebaseio.com"
})
const db = admin.database();

(async () => {
  try{
  const browser = await puppeteer.launch({
      headless : 'new'
  })

  const page = await browser.newPage()
  const loginPage = 'https://auth.band.us/login_page?next_url=https%3A%2F%2Fband.us%2Fhome%3Freferrer%3Dhttps%253A%252F%252Fband.us%252F'
  // 네이버 밴드 사이트 로그인 페이지로 이동
  await page.goto(loginPage)
  console.log('Navigated to login page.')

  await page.click('#login_list > li:nth-child(1) > a')
  console.log('이멜 로그인 창 까지 옴ㅇㅇ')
  
  // const emailSelector = "div#loginform #email_container input[name='email']"
  const emailSelector = "#input_email"
  // const passSelector = "div#loginform div.clearfix._5466._44mg input[name='pass']"
  const passSelector = "#pw"
  await page.screenshot({path: 'screenshot.png'})    
  console.log('스샷찍음ㅇㅇ')
  await page.waitForTimeout(5000); // 5초 대기
  await page.waitForSelector(emailSelector,  { timeout: 60000 })
  await page.type(emailSelector, process.env.ID)
  await page.waitForSelector(passSelector,  { timeout: 60000 })
  await page.type(passSelector, process.env.PW)
  await page.keyboard.press('Enter')
  await page.waitForNavigation({ waitUntil: 'networkidle0' })

  // 로그인 처리
  await page.waitForSelector('#content > section > div.homeMyBandList.gMat20.gPab35._myBandListWrap > div > ul > li:nth-child(2)', { visible: true, timeout: 10000 })

  console.log('로그인 성공')

  // 일정 페이지로 이동
  await Promise.all([
    page.waitForNavigation(),
    page.goto('https://band.us/band/77309128/calendar')
  ]);
  console.log('Navigated to calendar page.')

  //이번달 확인
  const date = new Date()
  let month = date.getMonth() + 1

  //월간 반복
  for(month; month >= 1; month--){
  await page.waitForSelector('#content > section > div.scheduleList.gContentCardShadow > ul > li > span > a')
  const modals = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('#content > section > div.scheduleList.gContentCardShadow > ul > li'))
    return anchors.length
  })
  console.log(`Found ${modals} schedules.`)

  //우리가 원하는 그것!!
  let participants = []
  let hosts = []
  let opportunity = {}

  //참석자
  const dataTarget = '#wrap > div.layerContainerView > div > section > div > div:nth-child(1) > div > div > div.scheduleMain > div.scheduleRsvpArea > ul > li:nth-child(1) > label:nth-child(2) > span > span'

  //2번째 라인. 참석 대기 or 불참석
  const dataTargetWait = '#wrap > div.layerContainerView > div > section > div > div:nth-child(1) > div > div > div.scheduleMain > div.scheduleRsvpArea > ul > li.uTableList._pendingAttendArea > label:nth-child(2) > span > strong'

  //벙주
  const dataTargetHost = '#wrap > div.layerContainerView > div > section > div > div:nth-child(1) > div > div > div.scheduleHead._scheduleHead > div.contWrap > div > span.hostName'

  // 각 일정 모달을 열어서 참가자 명단을 크롤링
  for(let i = 1; i <= modals; i++) {
    const contents = await page.evaluate((index) => {
      return Array.from(document.querySelectorAll(`#content > section > div.scheduleList.gContentCardShadow > ul > li:nth-child(${index}) > span > a`)).length
    }, i)
    for(let j = 1; j <= contents; j++){
      await page.click(`#content > section > div.scheduleList.gContentCardShadow > ul > li:nth-child(${i}) > span > a:nth-child(${j})`)
      try {
        await page.waitForSelector(dataTarget, { timeout: 1000 }) // timeout 옵션을 추가하여 짧은 시간 내에 찾지 못하면 넘어감
        await page.waitForSelector(dataTargetHost, { timeout: 1000 }) // timeout 옵션을 추가하여 짧은 시간 내에 찾지 못하면 넘어감
      } catch (error) {
        console.log('dataTarget not found, skipping')
        await page.keyboard.press('Escape')
        continue // 해당 요소가 발견되지 않으면 다음 반복으로 건너뜀
      } 
      
      //벙 카운트 추가
      opportunity[i] = (opportunity[i] || 0 ) + 1

      //참석자 명단 찾기
      const names = await page.evaluate((dataTarget) => {
        const element = document.querySelector(dataTarget)
        return element ? element.textContent : null
      }, dataTarget)

      //벙주 찾기
      const host = await page.evaluate((dataTargetHost) => {
        const element = document.querySelector(dataTargetHost)
        return element ? element.textContent : null
      }, dataTargetHost)
      
      //참석 외의 추가 투표란 멤버 찾기
      for(let k = 4; k <= 5; k++){

        //참석 대기가 있을 경우 k+1을 사용
        let n = k

        //두번째 라인. 참석 대기 or 불참석임
        const secondLine = await page.evaluate((dataTargetWait) => {
          const element = document.querySelector(dataTargetWait)
          return element ? element.textContent : null
        }, dataTargetWait)

        try {
          //두번째 라인이 '참석 대기'면, 즉 게스트라인이 5번째부터 시작하면 n++부터 찾음.
          if(secondLine === '참석 대기') n++
          const getDataTargetSecond = (i) => `#wrap > div.layerContainerView > div > section > div > div:nth-child(1) > div > div > div.scheduleMain > div.scheduleRsvpArea > ul > li:nth-child(${i}) > label:nth-child(2) > span > span`
          await page.waitForSelector(getDataTargetSecond(n), {timeout: 100})
        } catch (error) {
          break //해당 요소가 발견되지 않으면 추가투표란 찾기 종료
        }

        //추가 게스트 참석자
        const restNames = await page.evaluate((n) => {
          const getDataTargetSecond = (i) => `#wrap > div.layerContainerView > div > section > div > div:nth-child(1) > div > div > div.scheduleMain > div.scheduleRsvpArea > ul > li:nth-child(${i}) > label:nth-child(2) > span > span`

          const element = document.querySelector(getDataTargetSecond(n))
          return element ? element.textContent : null
        }, n)
        console.log('추가 게스트 발견')
        participants = restNames ? participants.concat(restNames) : participants

      }
      participants = names ? participants.concat(names) : participants
      hosts = host ? hosts.concat(host) : hosts
      // 모달 닫기
      await page.keyboard.press('Escape')
    }
  }

  // 파이어베이스에 결과를 저장
  const ref = db.ref(`bandschedule/${month}month`)
  await ref.set(participants)
  const refHost = db.ref(`hostList/${month}month`)
  await refHost.set(hosts)
  console.log(`Data for schedule_${month} saved to Firebase.`)
  participants = [] // 다음 일정을 위해 참가자 배열 초기화
  await page.click(`#content > section > div.calendarViewWrap.gContentCardShadow > div:nth-child(1) > div.calendarHeader > div.month > button.prev._btnPrev`)
  }


  //데이터 가공
  await processFirebaseData()
  } catch (error) {
    console.error('An error occurred:', error)
  }

  //브라우저 닫기
})()

//데이터 가공
async function processFirebaseData () {
  try {
    // Firebase에서 데이터 가져오기
    const bandschedule = await db.ref('bandschedule').get()
    const memberList = await db.ref('memberList').get()
    const hostList = await db.ref('hostList').get()
    const scheduleData = bandschedule.val()
    const memberListData = memberList.val()
    const hostListData = hostList.val()

    let modifiedMemberList = memberListData

    // 데이터 가공 및 수정 작업
    let factoring = [{},{},{},{},{},{},{},{},{},{},{},{}]
    let factoringHost = [{},{},{},{},{},{},{},{},{},{},{},{}]
    let users = {}
    let usersHost = {}

    //1차 가공 - 월별로 정리
    //벙 참석
    Object.values(scheduleData).forEach((schedule, i) => {
      schedule.forEach((list) => {
        list.split(',').forEach((name) => {
          let trimname = name.trim()
          factoring[i][trimname] = (factoring[i][trimname] || 0) + 1
        })
      })
    })
    //벙 개설
    Object.values(hostListData).forEach((schedule, i) => {
      schedule.forEach((list) => {
        list.split(',').forEach((name) => {
          let trimname = name.trim()
          factoringHost[i][trimname] = (factoringHost[i][trimname] || 0) + 1
        })
      })
    })

    //2차 가공 - 유저별로 정리
    //벙 참석
    factoring.forEach((month, i) => {
      Object.entries(month).forEach(([name, count]) => {
        if (!users[name]) {
          users[name] = {}
        }
        users[name][(i+1) + 'month'] = count
        users[name]['total'] = (users[name]['total'] || 0 ) + count
      })
    })
    //벙 개설
    factoringHost.forEach((month, i) => {
      Object.entries(month).forEach(([name, count]) => {
        if (!usersHost[name]) {
          usersHost[name] = {}
        }
        usersHost[name][(i+1) + 'month'] = count
        usersHost[name]['total'] = (usersHost[name]['total'] || 0 ) + count
      })
    })

    //최종 데이터 바인딩
    //벙 참여
    for (let [id, userObj] of Object.entries(memberListData)){
      const currentUserData = users[userObj.name]
      if (!currentUserData) { // users[userObj.name]이 존재하지 않는지 확인
        continue; // 현재 반복 건너뛰고 다음 반복으로 넘어감
      }
      
      for(let [month, count] of Object.entries(currentUserData)) {
        if (!modifiedMemberList[id]) {
          modifiedMemberList[id] = {}
        }
        modifiedMemberList[id][month] = count
      }
    }

    //벙 개설
    for (let [id, userObj] of Object.entries(memberListData)){
      const currentUserData = usersHost[userObj.name]
      if (!currentUserData) { // users[userObj.name]이 존재하지 않는지 확인
        continue // 현재 반복 건너뛰고 다음 반복으로 넘어감
      }
      
      for(let [month, count] of Object.entries(currentUserData)) {
        if (!modifiedMemberList[id]) {
          modifiedMemberList[id] = {}
        }
        modifiedMemberList[id][`${month}Host`] = count
      }
    }
    
    // 수정된 데이터를 Firebase에 다시 저장
    await db.ref('memberList').set(modifiedMemberList)
    // 백업 보관
    await db.ref('backup').set(memberListData)
    console.log('Data processed and updated in Firebase.')
  } catch (error) {
      console.error('An error occurred:', error)
  }
}

