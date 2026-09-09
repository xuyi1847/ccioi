import {create} from "zustand";
import type {Channel,Recommendation} from "@/services/api";
type State={channels:Channel[];channel?:Channel;current?:Recommendation;next?:Recommendation;playing:boolean;progress:number;connected:boolean;loading:boolean;error?:string;set:(patch:Partial<State>)=>void};
export const usePlayer=create<State>((set)=>({channels:[],playing:false,progress:0,connected:false,loading:false,set}));
