"use strict"
var wsk = null;
var wsid = null;
// 스트림을 전달 받을 비디오 요소
var localVideo = document.querySelector('#localVideo');
var wscount = document.querySelector('p#wscount');
var ws_button = document.querySelector('#ws_button');

const Constraints = { video: true, audio: false  };
let localStream = null;
const remoteStream = new MediaStream(); //먼저 빈 인스턴스 생성
async function getUserMediaStream(Constraints){
  console.log('0. 클라인언트의 카메라에서 localstream을 불러오기');
  // 1. 호출 후 브라우저는 사용자에게 카메라에 액세스 할 수 있는 권한을 요청
  await navigator.mediaDevices.getUserMedia(Constraints)
    .then(stream =>{                  // 2. stream을 가져옴
      localVideo.srcObject = stream;  // 3. srcObject속성을 통해 로컬 스트림을 화면에 출력
      localStream = stream;           // 4. 로컬의 스트림을 localStream 변수에 전달
    })
    .catch(error =>{ // 2. 실패 할경우 에러 메시지 출력
      console.log('navigator.getUserMedia error: ', error);
    });
}
  // 시그널링을 위해 소켓 객체 생성
  async function try_ws_connect(){
    await getUserMediaStream(Constraints); // 로컬 스트림 처리 로직
    const videoTracks = await localStream.getVideoTracks();
    if(videoTracks.length > 0){
      console.log(`1. 클라이언트 장치 확인 : ${videoTracks[0].label}`) // 사용하는 카메라 장치 확인
    }
    var wsid_html = await document.getElementById("wsid").value;
    wsid = wsid_html;
    const wstype = 'webrtc'
    //const url = 'ws://192.168.31.77:8080' //https://0a810349c89b.ngrok.io   
    const url = 'wss://f386adbe4a01.ngrok.io'
    wsk = new WebSocket(`${url}/wsid=${wsid}&wstype=${wstype}`); // 웹소켓 연결 및 소켓 객체 생성
    console.log(`2. 웹소켓 연결 :: ${url}/wsid=${wsid}&wstype=${wstype}`)
    const configuration = {'iceServers': [{'urls': 'stun:stun.l.google.com:19302'}]} // stun 서버 주소
    const peerConnection = new RTCPeerConnection(configuration); // RTCPeerConnection객체 생성
 
    // 로컬 스트림을 track에 추가
    localStream.getTracks().forEach(track => {
      console.log('add local stream to track!!')
      peerConnection.addTrack(track, localStream);
      console.log(localStream);
    });      
    var remoteVideo = document.querySelector('#remoteVideo');
    // 원격에서 전달되는 스트림 수신하기 위해 새로 추가된 track이 있는지 확인하는 리스너
    peerConnection.addEventListener('track', async (event) => {
      if(remoteVideo.srcObject !== event.streams[0]){
        remoteVideo.srcObject = event.streams[0];   // 새로 발생된 track의 원격 스트림을 화면에 출력 
        console.log('[Listener] find track and get remote stream !!')
        //console.log(event);
        console.log(event.streams[0])
      }
    });
    // 로컬의 ICE 후보를 수집 하기 위해 icecandidate를 이벤트로 등록
    peerConnection.addEventListener('icecandidate', event => {
      if (event.candidate) {
        console.log('[Listener] find new icecandidate!!')
        wsk.send(JSON.stringify({optype : 'new-ice-candidate', icecandidate : event.candidate, 'wsid' : wsid})); // 발견된 ICE를 원격 피어로 전달
      }else{
        console.log('[Listener] All ICE candidates have been sent');
      }
    });
    // 연결 완료 상황을 알기 위해 connectionstatechange 이벤트 등
    peerConnection.addEventListener('connectionstatechange', event => {
      if (event) {
        console.log(`[Listener] 연결 상태 :: ${peerConnection.connectionState}`) // 연결 상태 체크
      }
    });
    async function getOffer(peerConnection){
      console.log("4. [호출측] 정보 준비 offer")
      const offer = await peerConnection.createOffer();   // 로컬에 대한 정보를 담은 객체 생성
      await peerConnection.setLocalDescription(offer);    // 이 객체를 로컬 설정에 등록
      //console.log(offer)
      return offer
    }
    async function treatOffer(peerConnection, offer){
      console.log("7. [수신측] 전달 받은 offer 내용을 수신측의 원격 정보로 등록.")
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));// 전달 받은 호출 측 메타 정보를 이용하여 세션 객체로 생성하고 원격 설정 내용에 등록
      const answer = await peerConnection.createAnswer(); // 수신 측 피어에 대한 정보를 담은 객체 생성
      await peerConnection.setLocalDescription(answer);  // 수신 측 피어 로컬 정보에 위 객체를 등록
      return answer
    }
    async function treatAnswer(peerConnection, answer){
      console.log("10. [호출측] 전달 받은 answer 내용을 호출측의 원격 정보로 등록")
      //console.log(answer);
      const remoteDesc = await new RTCSessionDescription(answer); // 전달 받은 수신측 메타 정보로 세션 객체로 생성
      await peerConnection.setRemoteDescription(remoteDesc);  // 수신 측 세션 객체를 피어의 원격의 설정 내용에 등록
    }

    // 웹소켓 연결시
    wsk.onopen = function () {
      console.log('3. [웹소켓 연결 성공] 웹 소켓 서버와 연결 됨');
      wsk.send(JSON.stringify({'optype': 'initi_signal' ,'wsid' : wsid})); // 현재 접속해 있는 웹소켓 수 체크 
    };
    // 웹소켓 메시지 처리 
    wsk.onmessage = function (event) { 
      let msgjson = JSON.parse(event.data);
      switch (msgjson.optype) {	
        case 'initi_signal':
          getOffer(peerConnection)
          .then(offer =>{
            console.log("5. [호출측] peerConnection 정보가 담긴 offer를 수신측으로 전달");
            wsk.send(JSON.stringify({'optype': 'offer' ,'offer': offer, 'wsid' : wsid}));   // 웹소켓을 통해 호출 측 피어에 대한 메타 정보를 수신 측으로 전달
          }) 
          break;
        case 'check_ws_num':
          console.log("웹소켓 접속자 수 업데이트");
          wscount.innerHTML = "접속자 수 : " + msgjson.ws_count;
          break;
        case 'offer': 
          console.log("6. [수신측] offer 받음.")
          treatOffer(peerConnection, msgjson.offer)
          .then(answer =>{
            console.log("8. [수신측] 호출측으로 수신측의 peerConnection 정보가 담긴 answer 전달 ");
            wsk.send(JSON.stringify({'optype': 'answer' ,'answer': answer, 'wsid' : wsid}));  // 호출 측에 응답으로 수신측 피어에 대한 메타 정보를 전달
          })
          break;
        case 'answer':
          console.log("9. [호출측] answer 받음.")
          treatAnswer(peerConnection, msgjson.answer).then(()=>{
            console.log("11. [호출측] 수신받은 answer 처리 끝. :: ");
          })
          break;
        case 'new-ice-candidate':
          console.log('새로운 new-ice-candidate를 받음.')
          //console.log(msgjson.icecandidate)
          try {
            peerConnection.addIceCandidate(msgjson.icecandidate); // 수신 받은 ICE를 등록
            console.log('전달 받은 new-ice-candidate를 등록 완료')
          } catch (e) {
            console.error('Error adding received ice candidate', e);
          }
          break;
        default:
          console.log('optype error : ' + msgjson.optype)
          break;
      }
    };
    // 웹소켓 종료시
    wsk.onclose = function () {
      console.log('[웹소켓 연결 종료] 웹 소켓 서버와 연결이 종료 됨');
    };
  }
