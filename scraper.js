const puppeteer = require('puppeteer');
const admin = require('firebase-admin');

// Firebase 설정
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://mlb-management-default-rtdb.firebaseio.com"
});
const db = admin.database()
;
(async () => {
  try{
    const browser = await puppeteer.launch({
        headless : false
    });

    const page = await browser.newPage();
    const loginPage = 'https://auth.band.us/login_page?next_url=https%3A%2F%2Fband.us%2Fhome%3Freferrer%3Dhttps%253A%252F%252Fband.us%252F'
    // 네이버 밴드 사이트 로그인 페이지로 이동
    await page.goto(loginPage);
    console.log('Navigated to login page.');


    // 로그인 처리
    await page.waitForNavigation();
    const waitForLogin = page.waitForSelector('#content > section > div.homeMyBandList.gMat20.gPab35._myBandListWrap > div > ul > li:nth-child(2)', { visible: true, timeout: 600000 });
    await waitForLogin

    console.log('로그인 성공')

    // 일정 페이지로 이동
    await Promise.all([
      page.waitForNavigation(),
      page.goto('https://band.us/band/77309128/calendar')
    ]);
    console.log('Navigated to calendar page.');

    //이번달 확인
    const date = new Date()
    const month = date.getMonth() + 1

    //월간 반복
    for(month; month >= 1; month--){
    await page.waitForSelector('#content > section > div.scheduleList.gContentCardShadow > ul > li > span > a');
    const modals = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('#content > section > div.scheduleList.gContentCardShadow > ul > li'));
      return anchors.length
    });
    console.log(`Found ${modals} schedules.`);

    let participants = [];
    let dataTarget = '#wrap > div.layerContainerView > div > section > div > div:nth-child(1) > div > div > div.scheduleMain > div.scheduleRsvpArea > ul > li:nth-child(1) > label:nth-child(2) > span > span'

    // 각 일정 모달을 열어서 참가자 명단을 크롤링
    for(let i = 1; i <= modals; i++) {
      const contents = await page.evaluate((index) => {
        return Array.from(document.querySelectorAll(`#content > section > div.scheduleList.gContentCardShadow > ul > li:nth-child(${index}) > span > a`)).length
      }, i)
      for(let j = 1; j <= contents; j++){
        await page.click(`#content > section > div.scheduleList.gContentCardShadow > ul > li:nth-child(${i}) > span > a:nth-child(${j})`);
        try {
          await page.waitForSelector(dataTarget, { timeout: 1000 }); // timeout 옵션을 추가하여 짧은 시간 내에 찾지 못하면 넘어감
      } catch (error) {
          console.log('dataTarget not found, skipping');
          await page.keyboard.press('Escape');
          continue; // 해당 요소가 발견되지 않으면 다음 반복으로 건너뜀
      }
        const names = await page.evaluate((dataTarget) => {
          const element = document.querySelector(dataTarget);
          return element ? element.textContent : null;
        }, dataTarget);
  
        participants = names ? participants.concat(names) : participants
        // 모달 닫기
        await page.keyboard.press('Escape');
      }
    }

    // 파이어베이스에 결과를 저장
    const ref = db.ref(`bandschedule/${month}month`);
    await ref.set(participants);
    console.log(`Data for schedule_${month} saved to Firebase.`);
    participants = []; // 다음 일정을 위해 참가자 배열 초기화
    await page.click(`#content > section > div.calendarViewWrap.gContentCardShadow > div:nth-child(1) > div.calendarHeader > div.month > button.prev._btnPrev`);
    }
    } catch (error) {
      console.error('An error occurred:', error);
  }
  await processFirebaseData()
})()

//데이터 가공
const processFirebaseData = async() => {
  try {
    // Firebase에서 데이터 가져오기
    const bandschedule = await db.ref('bandschedule').get()
    const memberList = await db.ref('memberList').get()
    const scheduleData = bandschedule.val()
    const memberListData = memberList.val()

    let modifiedMemberList = memberListData

    // 데이터 가공 및 수정 작업
    let factoring = [{},{},{},{},{},{},{},{},{},{},{},{}]
    let users = {}

    //1차 가공 - 월별로 정리
    Object.values(scheduleData).forEach((schedule, i) => {
      schedule.forEach((list) => {
        list.split(',').forEach((name) => {
          let trimname = name.trim()
          factoring[i][trimname] = (factoring[i][trimname] || 0) + 1
        })
      })
    })

    //2차 가공 - 유저별로 정리
    factoring.forEach((month, i) => {
      Object.entries(month).forEach(([name, count]) => {
        if (!users[name]) {
          users[name] = {}
        }
        users[name][(i+1) + 'month'] = count
        users[name]['total'] = (users[name]['total'] || 0 ) + count
      })
    })

    //최종 데이터 바인딩
    for (let [id, userObj] of Object.entries(memberListData)){
      for(let [month, count]  of Object.entries(users[userObj.name])){
        if (!modifiedMemberList[id]) {
          modifiedMemberList[id] = {}
        }
        modifiedMemberList[id][month] = count
      }
    }
    
    // 수정된 데이터를 Firebase에 다시 저장
    await db.ref('memberList').set(modifiedMemberList)
    console.log('Data processed and updated in Firebase.')
  } catch (error) {
      console.error('An error occurred:', error)
  }
}

// 실행

