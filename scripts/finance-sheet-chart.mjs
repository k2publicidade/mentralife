import Chart from 'chart.js/auto';

const palette=['#216651','#2764a5','#a34e1a','#84499b','#8a6a04','#b13e61','#52792f','#4b5563'];

export function drawChart(canvas,kind,labels,series){
 const circular=kind==='pie'||kind==='doughnut';
 return new Chart(canvas,{
  type:kind==='horizontal'||kind==='stacked'?'bar':kind,
  data:{labels,datasets:series.map(({label,data},index)=>({
   label,data,
   backgroundColor:circular?labels.map((_,i)=>palette[i%palette.length]):palette[index],
   borderColor:palette[index],
   tension:0.2
  }))},
  options:{
   animation:false,responsive:true,maintainAspectRatio:false,locale:'pt-BR',
   indexAxis:kind==='horizontal'?'y':'x',
   scales:circular?{}:{x:{stacked:kind==='stacked'},y:{stacked:kind==='stacked',beginAtZero:kind!=='line'}},
   plugins:{legend:{position:'bottom'}}
  }
 });
}
